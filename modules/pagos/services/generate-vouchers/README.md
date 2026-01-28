# Generate Vouchers Service

Servicio para generación automática de vouchers de cobro según configuración de contratos.

## Características

- ✅ **Generación automática** según día del mes configurado
- ✅ **Soporte para CLP y UF** con conversión automática
- ✅ **Cálculo de fechas** (generación, envío, vencimiento)
- ✅ **Verificación de duplicados** (no genera si ya existe)
- ✅ **Regeneración forzada** para casos especiales
- ✅ **Obtención automática de UF** desde mindicador.cl

## Uso Local

```bash
# Generar todos los vouchers del día
pnpm generate-vouchers

# Generar vouchers de una organización específica
pnpm generate-vouchers --org <org_id>

# Regenerar voucher de una propiedad
pnpm generate-vouchers --propiedad <propiedad_id>

# Forzar regeneración (elimina existente)
pnpm generate-vouchers --propiedad <propiedad_id> --force
```

## Flujo de Trabajo

1. **Obtiene contratos VIGENTES** que deben generar voucher hoy
2. **Carga configuración actual** de cada contrato (última versión)
3. **Obtiene valor UF** si hay contratos en UF
4. **Verifica duplicados** para evitar generar múltiples veces
5. **Calcula montos y fechas** según configuración
6. **Crea voucher** en estado `GENERADO`

## Criterios de Generación

Un voucher se genera cuando:

- ✅ Contrato está en estado `VIGENTE`
- ✅ `dia_generacion` del contrato = día de hoy
- ✅ NO existe voucher para el mismo período
- ✅ Contrato tiene configuración válida

## Cálculo de Montos

### Contratos en CLP

```typescript
monto_arriendo_clp = config.monto_arriendo
```

### Contratos en UF

```typescript
// Obtener valor UF según método configurado
const valorUF = metodo === "inicio_mes"
  ? ufCache["inicio_mes"]  // UF del día 1 del mes
  : ufCache["dia_generacion"]; // UF del día de hoy

monto_arriendo_clp = Math.trunc(config.monto_arriendo * valorUF);
```

## Cálculo de Fechas

### Período

El período es el **mes siguiente** a la fecha de generación:

```typescript
// Si generamos el 2025-01-22
periodo = "2025-02" // Febrero 2025
```

### Fecha de Envío Programada

```typescript
if (dia_envio === null) {
  // Se envía el mismo día de generación
  fecha_envio_programada = fecha_generacion;
} else {
  // Se envía en el día especificado del período
  fecha_envio_programada = new Date(periodo_year, periodo_month, dia_envio);
}
```

### Fecha de Vencimiento

```typescript
// Siempre es el día limite_pago del período
fecha_vencimiento = new Date(periodo_year, periodo_month, limite_pago);
```

## Ejemplo de Voucher Generado

```json
{
  "folio": "FOLIO-12345-2025-02",
  "contrato_id": "uuid-del-contrato",
  "propiedad_id": 12345,
  "org_id": "uuid-de-la-org",
  "config_version_usada": 1,
  "estado": "GENERADO",
  "periodo": "2025-02",
  "fecha_generacion": "2025-01-22T12:00:00.000Z",
  "fecha_envio_programada": "2025-02-01",
  "fecha_vencimiento": "2025-02-05",
  "moneda": "UF",
  "valor_uf_generacion": 37842.15,
  "monto_arriendo": 25.5,
  "monto_arriendo_clp": 964975,
  "items_bitacora": null,
  "monto_pagado": null,
  "detalle_pago": null
}
```

## Valores de UF

El servicio obtiene valores UF desde [mindicador.cl](https://mindicador.cl):

### UF del día de generación

```bash
GET https://mindicador.cl/api/uf
```

### UF del primer día del mes

```bash
GET https://mindicador.cl/api/uf/2025-01-01
```

Si falla la obtención de UF del inicio de mes, usa el valor del día de hoy como fallback.

## Configuración de Contratos

El servicio lee la configuración desde `contratos_config_historico`:

```sql
SELECT
  config_id,
  version,
  moneda_arriendo,
  monto_arriendo,
  metodo_calculo_uf
FROM contratos_config_historico
WHERE contrato_id = ?
ORDER BY version DESC
LIMIT 1
```

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Cron Job (Producción)

Este servicio debe ser llamado diariamente por QStash:

```javascript
// QStash job configuration
{
  "schedule": "0 8 * * *", // 8:00 AM todos los días
  "url": "https://tu-app.com/api/cron/generate-vouchers",
  "method": "POST"
}
```

## Tipos de Respuesta

```typescript
interface GenerateVouchersResult {
  success: boolean;
  generated: number;
  skipped: number;
  errors: VoucherError[];
  vouchers: GeneratedVoucher[];
}

interface VoucherError {
  contrato_id: string;
  propiedad_id: string;
  error: string;
}

interface GeneratedVoucher {
  voucher_id: string;
  folio: string;
  contrato_id: string;
  propiedad_id: string;
  periodo: string;
  monto_arriendo: number;
  monto_arriendo_clp: number;
  moneda: "CLP" | "UF";
}
```

## Manejo de Errores

El servicio registra errores por contrato sin detener el proceso:

```typescript
// Si un contrato falla, continúa con los demás
try {
  // Generar voucher
} catch (error) {
  result.errors.push({
    contrato_id: contrato.contrato_id,
    propiedad_id: contrato.propiedad_id,
    error: error.message
  });
  // Continúa con el siguiente
}
```

## Regeneración Forzada

Cuando se usa `--force`, el servicio:

1. ✅ Elimina el voucher existente
2. ✅ Genera un nuevo voucher con la configuración actual
3. ⚠️ **Cuidado**: Solo usar para correcciones, ya que pierde datos del voucher anterior

```bash
pnpm generate-vouchers --propiedad 12345 --force
```

## Notas Importantes

- ✅ **Portable a Supabase Edge Functions** (Deno compatible)
- ✅ **Caché de valores UF** para evitar múltiples llamadas a API externa
- ✅ **Validación de configuración** antes de generar
- ✅ **Logs detallados** para debugging
- ⚠️ **No genera si ya existe** (a menos que sea `--force`)
- ⚠️ **Usa última versión de config** del contrato

## Testing Local

```bash
# Ver logs detallados
pnpm generate-vouchers

# Output esperado:
# ============================================================
# 🚀 GENERADOR DE VOUCHERS - TEST LOCAL
# ============================================================
#
# ✅ Variables de entorno cargadas
# 📍 Supabase URL: https://...
# 🔑 Usando Service Role Key (bypasa RLS)
#
# 📋 Parámetros de ejecución:
#    - Modo: TODOS los contratos del día
#
# ⏳ Ejecutando generación de vouchers...
#
# [generate-vouchers] Iniciando generación para día 22, período 2026-01
# [generate-vouchers] Encontrados 5 contratos VIGENTES para procesar
# [generate-vouchers] 3 contratos en UF, obteniendo valores...
# [getUFValue] Valor UF obtenido: 37842.15
# [generate-vouchers] Generado: FOLIO-12345-2026-01 - CLP 850000
# [generate-vouchers] Generado: FOLIO-67890-2026-01 - UF 25.5 (CLP 964975)
#
# ============================================================
# 📊 RESULTADOS
# ============================================================
#
# ✅ Ejecución exitosa en 1234ms
#
# 📈 Estadísticas:
#    - Vouchers generados: 2
#    - Vouchers saltados: 3
#    - Errores: 0
```
