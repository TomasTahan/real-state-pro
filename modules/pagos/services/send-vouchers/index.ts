/**
 * Servicio de Envío de Vouchers
 *
 * Este servicio se encarga de enviar los vouchers de cobro a los arrendatarios
 * según la configuración de cada organización.
 *
 * Puede ser llamado de tres formas:
 * 1. Sin parámetros: Envía todos los vouchers programados para hoy
 * 2. Con org_id: Envía vouchers de una organización específica
 * 3. Con voucher_id: Envía un voucher específico (reenvío manual)
 *
 * Este archivo está diseñado para ser portable a Supabase Edge Functions (Deno)
 * con mínimas modificaciones.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { renderVoucherReminderEmail } from "./emails/renderer-react";

// ============================================================================
// TIPOS
// ============================================================================

export interface SendVouchersParams {
  voucher_id?: string;
  org_id?: string;
  /** Forzar envío aunque ya haya sido enviado (útil para reenviar) */
  force?: boolean;
}

export interface SendVouchersResult {
  success: boolean;
  sent: number;
  skipped: number;
  errors: VoucherError[];
  vouchers: SentVoucher[];
}

export interface VoucherError {
  voucher_id: string;
  propiedad_id: string;
  error: string;
}

export interface SentVoucher {
  voucher_id: string;
  folio: string;
  propiedad_id: string;
  email?: string;
  whatsapp?: string;
  metodo_envio: string[];
}

interface VoucherConDatos {
  voucher_id: string;
  folio: string;
  propiedad_id: string;
  contrato_id: string;
  org_id: string;
  periodo: string;
  fecha_vencimiento: string;
  monto_arriendo_clp: number;
  moneda: "CLP" | "UF";
  estado: string;
  fecha_envio_programada: string;
  // Datos del arrendatario
  arrendatario_nombre: string;
  arrendatario_email: string | null;
  arrendatario_telefono: string | null;
  arrendatario_metodo_contacto: MetodoContacto | null;
}

interface MetodoContacto {
  mail?: boolean;
  whatsapp?: boolean;
}

interface OrganizacionConfig {
  org_id: string;
  nombre: string;
  email_provider: EmailProviderConfig | null;
}

interface EmailProviderConfig {
  provider: "RESEND" | "N8N";
  webhook?: string; // Solo para N8N
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Formatea fecha a DD/MM/YYYY
 */
function formatDateDisplay(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formatea monto a CLP
 */
function formatAmount(amount: number, moneda: "CLP" | "UF"): string {
  if (moneda === "UF") {
    return `${amount.toFixed(2)} UF`;
  }
  return `$${amount.toLocaleString("es-CL")} CLP`;
}

/**
 * Envía email mediante Resend
 */
async function sendEmailViaResend(
  voucher: VoucherConDatos,
  toEmail: string
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY no configurada");
  }

  const emailBody = `
    <h2>Voucher de Pago - ${voucher.folio}</h2>
    <p>Estimado/a ${voucher.arrendatario_nombre},</p>
    <p>Le recordamos que tiene un pago pendiente de arriendo.</p>

    <h3>Detalles del pago:</h3>
    <ul>
      <li><strong>Período:</strong> ${voucher.periodo}</li>
      <li><strong>Monto:</strong> ${formatAmount(voucher.monto_arriendo_clp, voucher.moneda)}</li>
      <li><strong>Fecha de vencimiento:</strong> ${formatDateDisplay(voucher.fecha_vencimiento)}</li>
      <li><strong>Folio:</strong> ${voucher.folio}</li>
    </ul>

    <p>Por favor, realice el pago antes de la fecha de vencimiento.</p>
    <p>Puede pagar en el siguiente enlace: [LINK DE PAGO - PENDIENTE]</p>

    <p>Saludos cordiales,</p>
    <p>Equipo de Administración</p>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "noreply@realstatepro.com", // TODO: Configurar dominio
      to: toEmail,
      subject: `Voucher de Pago - ${voucher.periodo}`,
      html: emailBody,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Error de Resend: ${response.statusText} - ${errorData}`);
  }

  console.log(`[send-vouchers] Email enviado via Resend a ${toEmail}`);
}

/**
 * Envía batch de emails mediante webhook de n8n
 */
async function sendBatchEmailsViaN8N(
  vouchers: Array<{
    voucher: VoucherConDatos;
    toEmail: string;
    orgNombre: string;
  }>,
  webhookUrl: string
): Promise<void> {
  // Renderizar todos los HTMLs en paralelo
  const vouchersWithHtml = await Promise.all(
    vouchers.map(async (v) => {
      const html = await renderVoucherReminderEmail({
        arrendatario_nombre: v.voucher.arrendatario_nombre,
        folio: v.voucher.folio,
        periodo: v.voucher.periodo,
        monto_arriendo_clp: v.voucher.monto_arriendo_clp,
        moneda: v.voucher.moneda,
        fecha_vencimiento: v.voucher.fecha_vencimiento,
        org_nombre: v.orgNombre,
      });

      return {
        voucher_id: v.voucher.voucher_id,
        to: v.toEmail,
        subject: `Recordatorio de Pago - ${v.voucher.periodo}`,
        html: html,
      };
    })
  );

  const payload = {
    vouchers: vouchersWithHtml,
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Error de n8n webhook: ${response.statusText} - ${errorData}`);
  }

  console.log(
    `[send-vouchers] Batch de ${vouchers.length} emails enviado via n8n webhook`
  );
}

/**
 * Envía mensaje de WhatsApp
 */
async function sendWhatsAppMessage(
  _voucher: VoucherConDatos,
  phoneNumber: string
): Promise<void> {
  // TODO: Implementar envío por WhatsApp Business API
  // Por ahora solo simulamos
  console.log(`[send-vouchers] WhatsApp enviado a ${phoneNumber} (SIMULADO)`);

  // Implementación pendiente:
  // - Integrar con WhatsApp Business API
  // - Usar plantilla aprobada
  // - Formatear número de teléfono correctamente
  // - Usar datos del voucher para personalizar mensaje

  throw new Error("Envío por WhatsApp aún no implementado");
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

export async function sendVouchers(
  supabase: SupabaseClient,
  params: SendVouchersParams = {}
): Promise<SendVouchersResult> {
  const result: SendVouchersResult = {
    success: true,
    sent: 0,
    skipped: 0,
    errors: [],
    vouchers: [],
  };

  const today = new Date();
  const todayString = today.toISOString().split("T")[0];

  console.log(`[send-vouchers] Iniciando envío para fecha ${todayString}`);
  console.log(`[send-vouchers] Parámetros:`, params);

  try {
    // ========================================================================
    // PASO 1: Obtener vouchers que corresponde enviar hoy
    // ========================================================================

    let queryVouchers = supabase
      .from("vouchers")
      .select(
        `
        voucher_id,
        folio,
        propiedad_id,
        contrato_id,
        org_id,
        periodo,
        fecha_vencimiento,
        monto_arriendo_clp,
        moneda,
        estado,
        fecha_envio_programada,
        contratos!inner (
          arrendatarios!inner (
            nombre,
            apellidos,
            email,
            telefono,
            metodo_contacto
          )
        )
      `
      )
      .eq("estado", "GENERADO");

    // Filtrar por fecha de envío programada (solo si no es reenvío manual)
    if (!params.voucher_id) {
      // Enviar si:
      // 1. fecha_envio_programada = hoy, O
      // 2. fecha_envio_programada es NULL (envío inmediato el mismo día de generación)
      queryVouchers = queryVouchers.or(
        `fecha_envio_programada.eq.${todayString},fecha_envio_programada.is.null`
      );
    }

    // Filtrar por organización si se especifica
    if (params.org_id) {
      queryVouchers = queryVouchers.eq("org_id", params.org_id);
    }

    // Filtrar por voucher específico si se especifica
    if (params.voucher_id) {
      queryVouchers = queryVouchers.eq("voucher_id", params.voucher_id);
    }

    const { data: vouchersRaw, error: vouchersError } = await queryVouchers;

    if (vouchersError) {
      console.error("[send-vouchers] Error en query:", vouchersError);
      throw new Error(`Error al obtener vouchers: ${vouchersError.message}`);
    }

    console.log(`[send-vouchers] Vouchers encontrados:`, vouchersRaw?.length || 0);

    if (!vouchersRaw || vouchersRaw.length === 0) {
      console.log("[send-vouchers] No hay vouchers para enviar");
      return result;
    }

    // Transformar datos
    const vouchers: VoucherConDatos[] = vouchersRaw.map((v: any) => ({
      voucher_id: v.voucher_id,
      folio: v.folio,
      propiedad_id: v.propiedad_id,
      contrato_id: v.contrato_id,
      org_id: v.org_id,
      periodo: v.periodo,
      fecha_vencimiento: v.fecha_vencimiento,
      monto_arriendo_clp: v.monto_arriendo_clp,
      moneda: v.moneda,
      estado: v.estado,
      fecha_envio_programada: v.fecha_envio_programada,
      arrendatario_nombre: v.contratos.arrendatarios.nombre + ' ' + (v.contratos.arrendatarios.apellidos || ''),
      arrendatario_email: v.contratos.arrendatarios.email,
      arrendatario_telefono: v.contratos.arrendatarios.telefono,
      arrendatario_metodo_contacto: v.contratos.arrendatarios.metodo_contacto as MetodoContacto | null,
    }));

    console.log(`[send-vouchers] ${vouchers.length} vouchers a procesar`);

    // ========================================================================
    // PASO 2: Obtener configuración de organizaciones
    // ========================================================================

    const orgIds = [...new Set(vouchers.map((v) => v.org_id))];

    const { data: organizaciones, error: orgsError } = await supabase
      .from("orgs")
      .select("org_id, nombre, email_provider")
      .in("org_id", orgIds);

    if (orgsError) {
      throw new Error(`Error al obtener organizaciones: ${orgsError.message}`);
    }

    const orgsMap = new Map<string, OrganizacionConfig>();
    organizaciones?.forEach((org) => {
      orgsMap.set(org.org_id, {
        org_id: org.org_id,
        nombre: org.nombre,
        email_provider: org.email_provider as EmailProviderConfig | null,
      });
    });

    console.log(`[send-vouchers] ${orgsMap.size} organizaciones configuradas`);

    // ========================================================================
    // PASO 3: Agrupar vouchers por organización y método de envío
    // ========================================================================

    // Agrupar por organización
    const vouchersPorOrg = new Map<string, VoucherConDatos[]>();
    vouchers.forEach((voucher) => {
      if (!vouchersPorOrg.has(voucher.org_id)) {
        vouchersPorOrg.set(voucher.org_id, []);
      }
      vouchersPorOrg.get(voucher.org_id)!.push(voucher);
    });

    // ========================================================================
    // PASO 4: Enviar vouchers por organización (BATCH)
    // ========================================================================

    for (const [orgId, orgVouchers] of vouchersPorOrg.entries()) {
      try {
        const org = orgsMap.get(orgId);

        if (!org) {
          throw new Error(`Organización ${orgId} no encontrada`);
        }

        const emailProvider = org.email_provider;

        if (!emailProvider) {
          console.warn(
            `[send-vouchers] Organización ${org.nombre} no tiene configurado proveedor de email, saltando ${orgVouchers.length} vouchers`
          );
          result.skipped += orgVouchers.length;
          continue;
        }

        // Filtrar vouchers según método de contacto preferido
        const vouchersConEmail = orgVouchers.filter((v) => {
          const metodoContacto = v.arrendatario_metodo_contacto;

          // Si no tiene método de contacto configurado, asumimos que acepta email
          if (!metodoContacto) return v.arrendatario_email !== null;

          // Solo enviar si el arrendatario acepta email
          return metodoContacto.mail === true && v.arrendatario_email !== null;
        });

        if (vouchersConEmail.length === 0) {
          console.warn(
            `[send-vouchers] Organización ${org.nombre}: ningún voucher tiene email habilitado o configurado`
          );
          result.skipped += orgVouchers.length;
          continue;
        }

        console.log(
          `[send-vouchers] Procesando ${vouchersConEmail.length} vouchers de org ${org.nombre} via ${emailProvider.provider}`
        );

        // ====================================================================
        // Envío por EMAIL (BATCH)
        // ====================================================================

        const voucherIdsEnviados: string[] = [];

        try {
          if (emailProvider.provider === "RESEND") {
            // Resend: enviar uno por uno (no tiene batch nativo)
            for (const voucher of vouchersConEmail) {
              await sendEmailViaResend(voucher, voucher.arrendatario_email!);
              voucherIdsEnviados.push(voucher.voucher_id);
            }
          } else if (emailProvider.provider === "N8N") {
            // N8N: enviar en batch
            if (!emailProvider.webhook) {
              throw new Error(
                `Organización ${org.nombre} tiene provider N8N pero no webhook configurado`
              );
            }

            await sendBatchEmailsViaN8N(
              vouchersConEmail.map((v) => ({
                voucher: v,
                toEmail: v.arrendatario_email!,
                orgNombre: org.nombre,
              })),
              emailProvider.webhook
            );

            // Todos los vouchers se enviaron
            voucherIdsEnviados.push(...vouchersConEmail.map((v) => v.voucher_id));
          } else {
            throw new Error(
              `Proveedor de email desconocido: ${emailProvider.provider}`
            );
          }

          // ================================================================
          // Actualizar estado de vouchers enviados (BATCH)
          // ================================================================

          if (voucherIdsEnviados.length > 0) {
            const { error: updateError } = await supabase
              .from("vouchers")
              .update({
                estado: "ENVIADO",
                fecha_envio_efectiva: new Date().toISOString(),
              })
              .in("voucher_id", voucherIdsEnviados);

            if (updateError) {
              throw new Error(
                `Error al actualizar estado de vouchers: ${updateError.message}`
              );
            }

            // Agregar a resultado
            vouchersConEmail.forEach((voucher) => {
              result.sent++;
              result.vouchers.push({
                voucher_id: voucher.voucher_id,
                folio: voucher.folio,
                propiedad_id: voucher.propiedad_id,
                email: voucher.arrendatario_email || undefined,
                metodo_envio: [
                  emailProvider.provider === "RESEND"
                    ? "EMAIL_RESEND"
                    : "EMAIL_N8N",
                ],
              });
            });

            console.log(
              `[send-vouchers] ✅ ${voucherIdsEnviados.length} vouchers enviados para org ${org.nombre}`
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[send-vouchers] Error enviando batch de org ${org.nombre}:`,
            errorMessage
          );

          // Agregar todos los vouchers de esta org como errores
          vouchersConEmail.forEach((voucher) => {
            result.errors.push({
              voucher_id: voucher.voucher_id,
              propiedad_id: voucher.propiedad_id,
              error: errorMessage,
            });
          });
        }

        // ====================================================================
        // Envío por WHATSAPP
        // ====================================================================

        // Filtrar vouchers que tengan WhatsApp habilitado
        const vouchersConWhatsapp = orgVouchers.filter((v) => {
          const metodoContacto = v.arrendatario_metodo_contacto;

          // Solo enviar si el arrendatario acepta WhatsApp
          return (
            metodoContacto?.whatsapp === true && v.arrendatario_telefono !== null
          );
        });

        if (vouchersConWhatsapp.length > 0) {
          console.log(
            `[send-vouchers] ${vouchersConWhatsapp.length} vouchers con WhatsApp habilitado (PENDIENTE IMPLEMENTAR)`
          );
          // TODO: Implementar envío batch por WhatsApp Business API
          // Por ahora solo se registra en logs
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[send-vouchers] Error procesando organización ${orgId}:`,
          errorMessage
        );

        // Agregar todos los vouchers de esta org como errores
        orgVouchers.forEach((voucher) => {
          result.errors.push({
            voucher_id: voucher.voucher_id,
            propiedad_id: voucher.propiedad_id,
            error: errorMessage,
          });
        });
      }
    }

    // ========================================================================
    // RESULTADO FINAL
    // ========================================================================

    result.success = result.errors.length === 0;

    console.log(`[send-vouchers] Resumen:`);
    console.log(`  - Enviados: ${result.sent}`);
    console.log(`  - Saltados: ${result.skipped}`);
    console.log(`  - Errores: ${result.errors.length}`);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[send-vouchers] Error fatal:`, errorMessage);

    result.success = false;
    result.errors.push({
      voucher_id: "GENERAL",
      propiedad_id: "GENERAL",
      error: errorMessage,
    });

    return result;
  }
}
