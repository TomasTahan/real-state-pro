/**
 * Servicio de Generación de Vouchers
 *
 * Este servicio se encarga de generar los vouchers de cobro para los contratos
 * que corresponden según su configuración de día de generación.
 *
 * Puede ser llamado de tres formas:
 * 1. Sin parámetros: Genera vouchers para TODOS los contratos que corresponden hoy
 * 2. Con org_id: Genera vouchers para todos los contratos de esa organización
 * 3. Con propiedad_id: Genera voucher para una propiedad específica (regeneración manual)
 *
 * Este archivo está diseñado para ser portable a Supabase Edge Functions (Deno)
 * con mínimas modificaciones.
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// TIPOS
// ============================================================================

export interface GenerateVouchersParams {
  propiedad_id?: string;
  org_id?: string;
  /** Forzar generación aunque ya exista voucher (útil para regenerar) */
  force?: boolean;
}

export interface GenerateVouchersResult {
  success: boolean;
  generated: number;
  skipped: number;
  errors: VoucherError[];
  vouchers: GeneratedVoucher[];
}

export interface VoucherError {
  contrato_id: string;
  propiedad_id: string;
  error: string;
}

export interface GeneratedVoucher {
  voucher_id: string;
  folio: string;
  contrato_id: string;
  propiedad_id: string;
  periodo: string;
  monto_arriendo: number;
  monto_arriendo_clp: number;
  moneda: "CLP" | "UF";
}

interface ContratoConConfig {
  contrato_id: string;
  propiedad_id: string;
  org_id: string;
  dia_generacion: number;
  dia_envio: number | null;
  limite_pago: number;
  // Config actual
  config_id: string;
  version: number;
  moneda_arriendo: "CLP" | "UF";
  monto_arriendo: number;
  metodo_calculo_uf: "inicio_mes" | "dia_generacion" | null;
}

interface UFResponse {
  version: string;
  autor: string;
  fecha: string;
  uf: {
    codigo: string;
    nombre: string;
    unidad_medida: string;
    fecha: string;
    valor: number;
  };
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Obtiene el valor de la UF desde mindicador.cl
 * @param fecha Fecha en formato YYYY-MM-DD (opcional, default: hoy)
 */
async function getUFValue(fecha?: string): Promise<number> {
  const url = fecha
    ? `https://mindicador.cl/api/uf/${fecha}`
    : "https://mindicador.cl/api/uf";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Error al obtener UF: ${response.statusText}`);
  }

  const data = (await response.json()) as UFResponse;

  console.log(`[getUFValue] URL: ${url}`);
  console.log(`[getUFValue] Buscando valor UF...`);

  // La API siempre devuelve un array en "serie" con los valores
  if ("serie" in data) {
    const serie = data as unknown as { serie: { valor: number; fecha: string }[] };
    if (serie.serie && serie.serie.length > 0) {
      const valor = serie.serie[0].valor;
      console.log(`[getUFValue] Valor UF obtenido: ${valor}`);
      return valor;
    }
    throw new Error(`No hay valores UF en la serie`);
  }

  // Fallback para formato antiguo (por si acaso)
  if ("uf" in data && data.uf?.valor) {
    console.log(`[getUFValue] Valor UF obtenido (formato antiguo): ${data.uf.valor}`);
    return data.uf.valor;
  }

  throw new Error(`Formato de respuesta de mindicador.cl no reconocido. Data: ${JSON.stringify(data)}`);
}

/**
 * Calcula el período del voucher (mes siguiente a la generación)
 */
function calcularPeriodo(fechaGeneracion: Date): string {
  const nextMonth = new Date(fechaGeneracion);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const year = nextMonth.getFullYear();
  const month = String(nextMonth.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

/**
 * Calcula la fecha de envío programada
 */
function calcularFechaEnvioProgramada(
  periodo: string,
  diaEnvio: number | null,
  fechaGeneracion: Date
): Date {
  // Si dia_envio es null, se envía el mismo día de generación
  if (diaEnvio === null) {
    return fechaGeneracion;
  }

  // Si hay día específico, es ese día del mes del período
  const [year, month] = periodo.split("-").map(Number);
  return new Date(year, month - 1, diaEnvio);
}

/**
 * Calcula la fecha de vencimiento
 */
function calcularFechaVencimiento(periodo: string, limitePago: number): Date {
  const [year, month] = periodo.split("-").map(Number);
  return new Date(year, month - 1, limitePago);
}

/**
 * Genera el folio del voucher
 */
function generarFolio(propiedadId: string, periodo: string): string {
  return `FOLIO-${propiedadId}-${periodo}`;
}

/**
 * Formatea fecha a YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

export async function generateVouchers(
  supabase: SupabaseClient,
  params: GenerateVouchersParams = {}
): Promise<GenerateVouchersResult> {
  const result: GenerateVouchersResult = {
    success: true,
    generated: 0,
    skipped: 0,
    errors: [],
    vouchers: [],
  };

  const today = new Date();
  const dayOfMonth = today.getDate();
  const periodo = calcularPeriodo(today);

  console.log(
    `[generate-vouchers] Iniciando generación para día ${dayOfMonth}, período ${periodo}`
  );
  console.log(`[generate-vouchers] Parámetros:`, params);

  try {
    // ========================================================================
    // PASO 1: Obtener contratos VIGENTES que corresponden para hoy
    // ========================================================================

    let queryContratos = supabase
      .from("contratos")
      .select(
        `
        contrato_id,
        propiedad_id,
        org_id,
        dia_generacion,
        dia_envio,
        limite_pago
      `
      )
      .eq("estado", "VIGENTE");

    // Filtrar por día de generación (solo si no es regeneración manual de una propiedad)
    if (!params.propiedad_id) {
      queryContratos = queryContratos.eq("dia_generacion", dayOfMonth);
    }

    // Filtrar por organización si se especifica
    if (params.org_id) {
      queryContratos = queryContratos.eq("org_id", params.org_id);
    }

    // Filtrar por propiedad si se especifica
    if (params.propiedad_id) {
      // Convertir a número si es BIGINT
      const propId = parseInt(params.propiedad_id);
      queryContratos = queryContratos.eq("propiedad_id", propId);
      console.log(`[generate-vouchers] Filtrando por propiedad_id: ${propId} (tipo: ${typeof propId})`);
    }

    const { data: contratos, error: contratosError } = await queryContratos;

    if (contratosError) {
      console.error("[generate-vouchers] Error en query:", contratosError);
      throw new Error(`Error al obtener contratos: ${contratosError.message}`);
    }

    console.log(`[generate-vouchers] Contratos VIGENTES encontrados:`, contratos?.length || 0);

    if (!contratos || contratos.length === 0) {
      console.log("[generate-vouchers] No hay contratos para procesar");
      return result;
    }

    console.log(
      `[generate-vouchers] Encontrados ${contratos.length} contratos VIGENTES para procesar`
    );

    // ========================================================================
    // PASO 1.5: Obtener última versión de config para cada contrato
    // ========================================================================

    const contratosConConfig: ContratoConConfig[] = [];

    for (const contrato of contratos) {
      const { data: config, error: configError } = await supabase
        .from("contratos_config_historico")
        .select(
          `
          config_id,
          version,
          moneda_arriendo,
          monto_arriendo,
          metodo_calculo_uf
        `
        )
        .eq("contrato_id", contrato.contrato_id)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (configError || !config) {
        console.error(
          `[generate-vouchers] Error obteniendo config para contrato ${contrato.contrato_id}:`,
          configError
        );
        result.errors.push({
          contrato_id: contrato.contrato_id,
          propiedad_id: contrato.propiedad_id.toString(),
          error: `No se pudo obtener configuración: ${configError?.message || "Config no encontrada"}`,
        });
        continue;
      }

      contratosConConfig.push({
        contrato_id: contrato.contrato_id,
        propiedad_id: contrato.propiedad_id,
        org_id: contrato.org_id,
        dia_generacion: contrato.dia_generacion,
        dia_envio: contrato.dia_envio,
        limite_pago: contrato.limite_pago,
        config_id: config.config_id,
        version: config.version,
        moneda_arriendo: config.moneda_arriendo,
        monto_arriendo: config.monto_arriendo,
        metodo_calculo_uf: config.metodo_calculo_uf,
      });
    }

    console.log(
      `[generate-vouchers] ${contratosConConfig.length} contratos con configuración válida`
    );

    if (contratosConConfig.length === 0) {
      console.log("[generate-vouchers] No hay contratos con configuración válida");
      return result;
    }

    // ========================================================================
    // PASO 2: Obtener valor UF (si hay contratos en UF)
    // ========================================================================

    // Verificar si hay contratos en UF
    const contratosEnUF = contratosConConfig.filter(
      (c) => c.moneda_arriendo === "UF"
    );

    // Cache de valores UF para evitar múltiples llamadas
    const ufCache: Record<string, number> = {};

    if (contratosEnUF.length > 0) {
      console.log(
        `[generate-vouchers] ${contratosEnUF.length} contratos en UF, obteniendo valores...`
      );

      // Obtener UF del día de hoy (para metodo_calculo_uf = 'dia_generacion')
      const ufHoy = await getUFValue();
      ufCache["dia_generacion"] = ufHoy;

      // Obtener UF del primer día del mes (para metodo_calculo_uf = 'inicio_mes')
      // Si falla, usar el valor de hoy como fallback
      let ufInicioMes: number;
      try {
        const primerDiaMes = new Date(today.getFullYear(), today.getMonth(), 1);
        ufInicioMes = await getUFValue(formatDate(primerDiaMes));
      } catch (error) {
        console.warn(
          `[generate-vouchers] No se pudo obtener UF del inicio de mes, usando valor de hoy como fallback`
        );
        ufInicioMes = ufHoy;
      }
      ufCache["inicio_mes"] = ufInicioMes;

      console.log(
        `[generate-vouchers] UF día generación: ${ufHoy}, UF inicio mes: ${ufInicioMes}`
      );
    }

    // ========================================================================
    // PASO 3: Verificar vouchers duplicados
    // ========================================================================

    const propiedadIds = contratosConConfig.map((c) => c.propiedad_id);

    const { data: vouchersExistentes, error: vouchersError } = await supabase
      .from("vouchers")
      .select("propiedad_id, voucher_id")
      .in("propiedad_id", propiedadIds)
      .eq("periodo", periodo);

    if (vouchersError) {
      throw new Error(
        `Error al verificar vouchers existentes: ${vouchersError.message}`
      );
    }

    const vouchersExistentesSet = new Set(
      (vouchersExistentes || []).map((v) => v.propiedad_id)
    );

    console.log(
      `[generate-vouchers] ${vouchersExistentesSet.size} propiedades ya tienen voucher para ${periodo}`
    );

    // ========================================================================
    // PASO 4: Generar vouchers
    // ========================================================================

    for (const contrato of contratosConConfig) {
      try {
        // Verificar si ya existe voucher (a menos que sea forzado)
        if (vouchersExistentesSet.has(contrato.propiedad_id) && !params.force) {
          console.log(
            `[generate-vouchers] Saltando ${contrato.propiedad_id}: ya existe voucher`
          );
          result.skipped++;
          continue;
        }

        // Calcular valores
        const folio = generarFolio(contrato.propiedad_id, periodo);
        const fechaEnvioProgramada = calcularFechaEnvioProgramada(
          periodo,
          contrato.dia_envio,
          today
        );
        const fechaVencimiento = calcularFechaVencimiento(
          periodo,
          contrato.limite_pago
        );

        // Calcular monto en CLP
        let valorUf: number | null = null;
        let montoArriendoCLP: number;

        if (contrato.moneda_arriendo === "UF") {
          const metodo = contrato.metodo_calculo_uf || "dia_generacion";
          valorUf = ufCache[metodo];
          montoArriendoCLP = Math.trunc(contrato.monto_arriendo * valorUf);
        } else {
          montoArriendoCLP = contrato.monto_arriendo;
        }

        // Crear voucher
        const voucherData = {
          folio,
          contrato_id: contrato.contrato_id,
          propiedad_id: contrato.propiedad_id,
          org_id: contrato.org_id,
          config_version_usada: contrato.version,
          estado: "GENERADO" as const,
          periodo,
          fecha_generacion: today.toISOString(),
          fecha_envio_programada: formatDate(fechaEnvioProgramada),
          fecha_vencimiento: formatDate(fechaVencimiento),
          moneda: contrato.moneda_arriendo,
          valor_uf_generacion: valorUf,
          monto_arriendo: contrato.monto_arriendo,
          monto_arriendo_clp: montoArriendoCLP,
          items_bitacora: null,
          monto_pagado: null,
          detalle_pago: null,
          etpay_token: null,
          etpay_payment_id: null,
          etpay_payment_details: null,
        };

        // Si es regeneración forzada, primero eliminar el existente
        if (params.force && vouchersExistentesSet.has(contrato.propiedad_id)) {
          const voucherExistente = vouchersExistentes?.find(
            (v) => v.propiedad_id === contrato.propiedad_id
          );
          if (voucherExistente) {
            const { error: deleteError } = await supabase
              .from("vouchers")
              .delete()
              .eq("voucher_id", voucherExistente.voucher_id);

            if (deleteError) {
              throw new Error(
                `Error al eliminar voucher existente: ${deleteError.message}`
              );
            }
            console.log(
              `[generate-vouchers] Eliminado voucher existente para regeneración`
            );
          }
        }

        const { data: voucher, error: insertError } = await supabase
          .from("vouchers")
          .insert(voucherData)
          .select("voucher_id, folio")
          .single();

        if (insertError) {
          throw new Error(`Error al crear voucher: ${insertError.message}`);
        }

        result.generated++;
        result.vouchers.push({
          voucher_id: voucher.voucher_id,
          folio: voucher.folio,
          contrato_id: contrato.contrato_id,
          propiedad_id: contrato.propiedad_id,
          periodo,
          monto_arriendo: contrato.monto_arriendo,
          monto_arriendo_clp: montoArriendoCLP,
          moneda: contrato.moneda_arriendo,
        });

        console.log(
          `[generate-vouchers] Generado: ${folio} - ${contrato.moneda_arriendo} ${contrato.monto_arriendo} (CLP ${montoArriendoCLP})`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[generate-vouchers] Error procesando contrato ${contrato.contrato_id}:`,
          errorMessage
        );

        result.errors.push({
          contrato_id: contrato.contrato_id,
          propiedad_id: contrato.propiedad_id,
          error: errorMessage,
        });
      }
    }

    // ========================================================================
    // RESULTADO FINAL
    // ========================================================================

    result.success = result.errors.length === 0;

    console.log(`[generate-vouchers] Resumen:`);
    console.log(`  - Generados: ${result.generated}`);
    console.log(`  - Saltados: ${result.skipped}`);
    console.log(`  - Errores: ${result.errors.length}`);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[generate-vouchers] Error fatal:`, errorMessage);

    result.success = false;
    result.errors.push({
      contrato_id: "GENERAL",
      propiedad_id: "GENERAL",
      error: errorMessage,
    });

    return result;
  }
}
