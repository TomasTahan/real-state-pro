# Send Vouchers Service

Servicio para envío automático de vouchers de cobro a arrendatarios vía email.

## Características

- ✅ **Envío en batch por organización** (una llamada por org)
- ✅ **Soporte para dos proveedores de email**: Resend y n8n
- ✅ **Respeta preferencias del arrendatario** (método de contacto)
- ✅ **Filtrado automático** por fecha de envío programada
- ✅ **Manejo de errores** por organización
- ✅ **Actualización masiva** de estados en Supabase
- ✅ **Template profesional con degradado oscuro** usando React Email
- ✅ **Responsive design** optimizado para mobile
- ⚠️ **WhatsApp en desarrollo** (detección ya implementada)

## Uso Local

```bash
# Enviar todos los vouchers programados para hoy
pnpm send-vouchers

# Enviar vouchers de una organización específica
pnpm send-vouchers --org <org_id>

# Reenviar un voucher específico
pnpm send-vouchers --voucher <voucher_id>

# Forzar reenvío aunque ya esté enviado
pnpm send-vouchers --voucher <voucher_id> --force

# Resetear todos los vouchers a estado GENERADO (para testing)
pnpm reset-vouchers

# Probar renderizado del template de email
pnpm test-email

# Generar archivo HTML de preview (se abre en navegador)
pnpm preview-email
```

## Flujo de Trabajo

1. **Obtiene vouchers** con estado `GENERADO` y fecha de envío programada = hoy
2. **Agrupa por organización** para envío eficiente
3. **Filtra vouchers** según preferencias de contacto del arrendatario
4. **Envía en batch** según proveedor (Resend o n8n)
5. **Actualiza estados** masivamente a `ENVIADO`

## Método de Contacto del Arrendatario

El servicio respeta las preferencias de contacto configuradas en la tabla `arrendatarios`:

### Campo `metodo_contacto` (JSONB)

```json
{
  "mail": true,      // Acepta recibir por email
  "whatsapp": false  // No acepta recibir por WhatsApp
}
```

### Lógica de Filtrado

- ✅ **Email**: Solo se envía si `metodo_contacto.mail === true` Y tiene `email` configurado
- ✅ **WhatsApp**: Solo se envía si `metodo_contacto.whatsapp === true` Y tiene `telefono` configurado
- ⚠️ **Sin configuración**: Si `metodo_contacto` es `null`, se asume que acepta email (comportamiento por defecto)

### Ejemplos

```typescript
// Arrendatario 1: Solo email
{
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "telefono": "+56912345678",
  "metodo_contacto": { "mail": true, "whatsapp": false }
}
// ✅ Recibirá voucher por EMAIL
// ❌ NO recibirá por WhatsApp

// Arrendatario 2: Solo WhatsApp
{
  "nombre": "María González",
  "email": "maria@example.com",
  "telefono": "+56987654321",
  "metodo_contacto": { "mail": false, "whatsapp": true }
}
// ❌ NO recibirá voucher por EMAIL
// ✅ Recibirá por WhatsApp (cuando esté implementado)

// Arrendatario 3: Ambos métodos
{
  "nombre": "Carlos Silva",
  "email": "carlos@example.com",
  "telefono": "+56911111111",
  "metodo_contacto": { "mail": true, "whatsapp": true }
}
// ✅ Recibirá voucher por EMAIL
// ✅ Recibirá por WhatsApp (cuando esté implementado)

// Arrendatario 4: Sin configuración
{
  "nombre": "Ana López",
  "email": "ana@example.com",
  "telefono": null,
  "metodo_contacto": null
}
// ✅ Recibirá voucher por EMAIL (comportamiento por defecto)
```

## Proveedores de Email

### Resend

Configuración en tabla `organizaciones`:

```json
{
  "provider": "RESEND"
}
```

- Se envía **un email por voucher** (Resend no tiene batch nativo)
- Requiere `RESEND_API_KEY` en variables de entorno

### n8n (Batch)

Configuración en tabla `organizaciones`:

```json
{
  "provider": "N8N",
  "webhook": "https://tu-n8n.com/webhook/send-vouchers"
}
```

- Se envía **un solo request** con array de vouchers
- n8n recibe todos los vouchers de la organización
- n8n itera y envía cada email individualmente

## Formato del Payload para n8n

El webhook de n8n recibirá un payload con este formato:

```json
{
  "vouchers": [
    {
      "voucher_id": "uuid-del-voucher",
      "folio": "FOLIO-12345-2025-01",
      "to_email": "arrendatario@example.com",
      "arrendatario_nombre": "Juan Pérez González",
      "periodo": "2025-01",
      "monto": 850000,
      "moneda": "CLP",
      "fecha_vencimiento": "2025-01-05"
    },
    {
      "voucher_id": "uuid-del-voucher-2",
      "folio": "FOLIO-67890-2025-01",
      "to_email": "maria.gonzalez@example.com",
      "arrendatario_nombre": "María González Rodríguez",
      "periodo": "2025-01",
      "monto": 25.5,
      "moneda": "UF",
      "fecha_vencimiento": "2025-01-10"
    }
  ]
}
```

### Campos del Voucher

| Campo                  | Tipo   | Descripción                                  |
| ---------------------- | ------ | -------------------------------------------- |
| `voucher_id`           | string | UUID del voucher                             |
| `folio`                | string | Folio único del voucher                      |
| `to_email`             | string | Email del arrendatario                       |
| `arrendatario_nombre`  | string | Nombre completo del arrendatario             |
| `periodo`              | string | Período de cobro (formato: `YYYY-MM`)       |
| `monto`                | number | Monto a pagar (decimal si es UF)             |
| `moneda`               | string | `"CLP"` o `"UF"`                             |
| `fecha_vencimiento`    | string | Fecha de vencimiento (formato: `YYYY-MM-DD`) |

## Workflow en n8n

El workflow de n8n debe:

1. **Recibir** el array de vouchers
2. **Iterar** sobre cada voucher en el array
3. **Generar HTML** del email con los datos del voucher
4. **Enviar email** a `to_email`
5. **Retornar** status 200 al finalizar

### Ejemplo de Nodo en n8n

**Split In Batches:**
```javascript
// Configurar para procesar el array de vouchers
$input.all()[0].json.vouchers
```

**Email Template:**
```html
<h2>Voucher de Pago - {{$json.folio}}</h2>
<p>Estimado/a {{$json.arrendatario_nombre}},</p>
<p>Le recordamos que tiene un pago pendiente de arriendo.</p>

<h3>Detalles del pago:</h3>
<ul>
  <li><strong>Período:</strong> {{$json.periodo}}</li>
  <li><strong>Monto:</strong> {{$json.moneda}} {{$json.monto}}</li>
  <li><strong>Fecha de vencimiento:</strong> {{$json.fecha_vencimiento}}</li>
  <li><strong>Folio:</strong> {{$json.folio}}</li>
</ul>

<p>Por favor, realice el pago antes de la fecha de vencimiento.</p>
```

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Resend (opcional, solo si se usa Resend)
RESEND_API_KEY=
```

## Cron Job (Producción)

Este servicio debe ser llamado diariamente por QStash para enviar los vouchers programados:

```javascript
// QStash job configuration
{
  "schedule": "0 9 * * *", // 9:00 AM todos los días
  "url": "https://tu-app.com/api/cron/send-vouchers",
  "method": "POST"
}
```

## Tipos de Respuesta

```typescript
interface SendVouchersResult {
  success: boolean;
  sent: number;
  skipped: number;
  errors: VoucherError[];
  vouchers: SentVoucher[];
}

interface VoucherError {
  voucher_id: string;
  propiedad_id: string;
  error: string;
}

interface SentVoucher {
  voucher_id: string;
  folio: string;
  propiedad_id: string;
  email?: string;
  metodo_envio: string[]; // ["EMAIL_RESEND"] o ["EMAIL_N8N"]
}
```

## Notas Importantes

- ⚠️ **WhatsApp aún no implementado** (la detección de preferencias ya funciona, falta integración con WhatsApp Business API)
- ✅ **Respeta preferencias del arrendatario** (campo `metodo_contacto` en tabla `arrendatarios`)
- ✅ **Batch update en Supabase** para mejor performance
- ✅ **Manejo de errores por organización** (si falla una org, las demás continúan)
- ✅ **Logs detallados** para debugging
- ✅ **Portable a Supabase Edge Functions** (Deno compatible)
- 💡 **Comportamiento por defecto**: Si un arrendatario no tiene `metodo_contacto` configurado, se asume que acepta email

## Testing

Para probar el webhook de n8n con curl:

```bash
curl -X POST https://tu-n8n.com/webhook/send-vouchers \
  -H "Content-Type: application/json" \
  -d '{
    "vouchers": [
      {
        "voucher_id": "550e8400-e29b-41d4-a716-446655440000",
        "folio": "FOLIO-12345-2025-01",
        "to_email": "test@example.com",
        "arrendatario_nombre": "Juan Pérez",
        "periodo": "2025-01",
        "monto": 850000,
        "moneda": "CLP",
        "fecha_vencimiento": "2025-01-05"
      }
    ]
  }'
```
