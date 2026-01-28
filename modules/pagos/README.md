# Módulo: Pagos

> **Módulo de cobranza del sistema**
> Gestiona vouchers de cobro, portal de pago y distribución de dinero (payouts)

## Descripción General

El módulo de Pagos es responsable de todo el ciclo de cobro de arriendos:

1. **Generación de vouchers**: Documentos de cobro mensuales generados automáticamente
2. **Portal de pago**: Interfaz donde el arrendatario paga su arriendo
3. **Payouts**: Distribución del dinero recibido a propietarios y administración

Este módulo consume datos del módulo de **Contratos** (configuración de cobro, multas, comisiones) y se integra con **Servicios Básicos** para permitir pago de agua, luz y gas junto con el arriendo.

## Ubicación

```
modules/pagos/
  ├── migration.sql    # Schema de base de datos
  └── README.md        # Esta documentación
```

## Responsabilidades

- **Generar vouchers**: Cron diario crea vouchers según configuración del contrato
- **Enviar vouchers**: Emails automáticos con link de pago
- **Calcular multas**: On-demand según días de atraso y config del contrato
- **Procesar pagos**: Integración con ETPAY para cobros
- **Registrar servicios**: Tracking de servicios básicos pagados
- **Distribuir dinero**: Payouts a propietarios y administración

## Estructura de Base de Datos

### Arquitectura: 2 Tablas + Alteración

```
vouchers (principal)
├── Datos del documento de cobro
├── Snapshot de configuración al generar
├── Estado del voucher
├── detalle_pago incluye servicios básicos pagados
└── Datos de pago ETPAY

payouts (distribución)
├── Referencias al voucher pagado
├── Tipo: PROPIETARIO o ADMINISTRACION
├── Monto y estado de transferencia
└── Datos de ETPAY Transfer

consultas_deuda (alteración)
├── + pagado: boolean
├── + voucher_id: referencia al voucher donde se pagó
└── + fecha_pago: timestamp del pago
```

### 1. `vouchers` (Tabla principal)

Contiene los documentos de cobro generados mensualmente:

```sql
vouchers:
  - voucher_id (PK, UUID)
  - folio (UNIQUE) -- FOLIO-{propiedad_id}-{YYYY}-{MM}

  -- Referencias
  - contrato_id (FK)
  - propiedad_id (FK)
  - organizacion_id (FK)
  - config_version_usada -- Snapshot de qué config se usó

  -- Estado
  - estado (GENERADO, ENVIADO, VENCIDO, PAGADO, ANULADO)
  - periodo (YYYY-MM)

  -- Fechas
  - fecha_generacion
  - fecha_envio_programada
  - fecha_envio_efectiva
  - fecha_vencimiento
  - fecha_pago

  -- Montos
  - moneda (CLP, UF)
  - valor_uf_generacion
  - monto_arriendo
  - monto_arriendo_clp -- Base para cálculo de multas

  -- Cargos/descuentos
  - items_bitacora (JSONB) -- [{id, monto, descripcion, tipo}]

  -- Pago
  - monto_pagado
  - detalle_pago (JSONB)

  -- ETPAY
  - etpay_token
  - etpay_payment_id
  - etpay_payment_details (JSONB)
```

**Estados del voucher**:

| Estado | Descripción |
|--------|-------------|
| `GENERADO` | Recién creado, pendiente de envío de email |
| `ENVIADO` | Email enviado al arrendatario |
| `VENCIDO` | Pasó `fecha_vencimiento` sin pago (sigue acumulando multas) |
| `PAGADO` | Pago recibido exitosamente |
| `ANULADO` | Cancelado manualmente |

### 2. `payouts` (Distribución de dinero)

Registro de transferencias post-pago:

```sql
payouts:
  - payout_id (PK)
  - voucher_id (FK)
  - organizacion_id (FK)
  - cuenta_bancaria_id (FK, nullable)

  -- Tipo y monto
  - tipo (PROPIETARIO, ADMINISTRACION)
  - monto

  -- Estado
  - estado (PENDIENTE, EN_PROCESO, COMPLETADO, FALLIDO)

  -- ETPAY
  - etpay_transfer_id
  - etpay_response (JSONB)

  -- Fechas
  - fecha_programada
  - fecha_ejecucion

  -- Error tracking
  - error_mensaje
  - reintentos
```

### 3. `consultas_deuda` (Alteración para tracking de pagos)

Se agregan campos a la tabla existente para marcar servicios como pagados:

```sql
-- Campos agregados a consultas_deuda:
ALTER TABLE consultas_deuda ADD:
  - pagado BOOLEAN DEFAULT FALSE    -- Si esta deuda fue pagada
  - voucher_id UUID (FK)            -- Referencia al voucher donde se pagó
  - fecha_pago TIMESTAMPTZ          -- Cuándo se pagó
```

**Ventajas de este enfoque**:
- No se crea una tabla adicional innecesaria
- `detalle_pago` en voucher tiene el snapshot de los servicios pagados
- `consultas_deuda` tiene la trazabilidad inversa (desde qué voucher se pagó)
- Consulta simple para ver servicios pendientes: `WHERE pagado = FALSE`

## Flujos de Datos

### Flujo 1: Generación de Voucher (Cron Diario 00:00)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CRON DIARIO 00:00                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Buscar contratos VIGENTES donde dia_generacion = HOY         │
│                                                                 │
│ 2. Por cada contrato:                                           │
│    a. Verificar que no exista voucher para este periodo         │
│    b. Obtener config actual (contratos_config_historico)        │
│    c. Obtener cargos/descuentos pendientes de bitácora          │
│    d. Calcular monto_arriendo_clp si moneda = UF                │
│    e. Lanzar bot para consultar servicios básicos (async)       │
│                                                                 │
│ 3. Crear voucher:                                               │
│    INSERT INTO vouchers (                                       │
│      folio = 'FOLIO-{propiedad_id}-{periodo}',                  │
│      estado = 'GENERADO',                                       │
│      config_version_usada = config.version,                     │
│      monto_arriendo = config.monto_arriendo,                    │
│      monto_arriendo_clp = calculado,                            │
│      items_bitacora = cargos_descuentos_json,                   │
│      fecha_envio_programada = contrato.dia_envio,               │
│      fecha_vencimiento = contrato.limite_pago                   │
│    )                                                            │
│                                                                 │
│ 4. Marcar cargos/descuentos de bitácora como procesados         │
└─────────────────────────────────────────────────────────────────┘
```

**Diagrama**:

```
Cron 00:00 → Contratos VIGENTES → Config actual → Bitácora → INSERT voucher
                                                           ↓
                                                    Bot servicios (async)
```

### Flujo 2: Envío de Voucher (Cron Diario)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CRON ENVÍO EMAILS                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Buscar vouchers:                                             │
│    - estado = 'GENERADO'                                        │
│    - fecha_envio_programada <= HOY                              │
│    - fecha_envio_efectiva IS NULL                               │
│                                                                 │
│ 2. Por cada voucher:                                            │
│    a. Obtener datos del arrendatario                            │
│    b. Generar URL de pago: /pago/{voucher_id}                   │
│    c. Enviar email (Resend o Webhook n8n)                       │
│    d. Actualizar voucher:                                       │
│       - estado = 'ENVIADO'                                      │
│       - fecha_envio_efectiva = NOW()                            │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo 3: Marcado de Vencidos (Cron Diario)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CRON VENCIMIENTOS                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Buscar vouchers:                                             │
│    - estado IN ('GENERADO', 'ENVIADO')                          │
│    - fecha_vencimiento < HOY                                    │
│                                                                 │
│ 2. Actualizar estado = 'VENCIDO'                                │
│                                                                 │
│ NOTA: Las multas se calculan on-demand, no se actualizan aquí   │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo 4: Portal de Pago

```
┌─────────────────────────────────────────────────────────────────┐
│                    GET /pago/{voucher_id}                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Consultar voucher_pago_view:                                 │
│    - Datos del voucher                                          │
│    - Multa calculada on-demand                                  │
│    - Datos de propiedad y arrendatario                          │
│                                                                 │
│ 2. Consultar servicios_deuda_actual:                            │
│    - Servicios activos de la propiedad                          │
│    - Última deuda consultada de cada uno                        │
│                                                                 │
│ 3. Renderizar portal:                                           │
│    ┌─────────────────────────────────────┐                      │
│    │ Voucher FOLIO-87-2024-05            │                      │
│    │ Propiedad: Av. Principal 123        │                      │
│    ├─────────────────────────────────────┤                      │
│    │ Arriendo:           $500.000        │                      │
│    │ Cargo (reparación): +$15.000        │                      │
│    │ Descuento:          -$5.000         │                      │
│    │ Multa (5 días):     +$3.219         │                      │
│    │ ─────────────────────────────       │                      │
│    │ Subtotal:           $513.219        │                      │
│    │                                     │                      │
│    │ Servicios básicos (opcional):       │                      │
│    │ □ Agua (Aguas Andinas): $30.290     │                      │
│    │ □ Luz (Enel):           $45.670     │                      │
│    │ □ Gas (Metrogas):       $23.450     │                      │
│    │ ─────────────────────────────       │                      │
│    │ TOTAL: $513.219                     │                      │
│    │                                     │                      │
│    │        [PAGAR CON ETPAY]            │                      │
│    └─────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo 5: Proceso de Pago

```
┌─────────────────────────────────────────────────────────────────┐
│            POST /api/pago/iniciar                               │
├─────────────────────────────────────────────────────────────────┤
│ Request: {                                                      │
│   voucher_id: "uuid",                                           │
│   servicios_seleccionados: ["servicio_id_1", "servicio_id_2"]   │
│ }                                                               │
│                                                                 │
│ 1. Validar voucher existe y no está PAGADO/ANULADO              │
│                                                                 │
│ 2. Recalcular monto total (seguridad, no confiar en frontend):  │
│    - Obtener monto_arriendo_clp                                 │
│    - Sumar cargos de items_bitacora                             │
│    - Restar descuentos de items_bitacora                        │
│    - Calcular multa actual (función SQL)                        │
│    - Sumar servicios seleccionados                              │
│                                                                 │
│ 3. Crear transacción ETPAY con monto total                      │
│                                                                 │
│ 4. Guardar etpay_token en voucher                               │
│                                                                 │
│ 5. Retornar URL de pago ETPAY                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│            WEBHOOK ETPAY (pago exitoso)                         │
├─────────────────────────────────────────────────────────────────┤
│ 1. Validar signature del webhook                                │
│                                                                 │
│ 2. Obtener voucher por etpay_token                              │
│                                                                 │
│ 3. Actualizar voucher:                                          │
│    - estado = 'PAGADO'                                          │
│    - fecha_pago = NOW()                                         │
│    - monto_pagado = monto de ETPAY                              │
│    - etpay_payment_id = id de ETPAY                             │
│    - etpay_payment_details = respuesta completa                 │
│    - detalle_pago = JSON con desglose                           │
│                                                                 │
│ 4. Marcar servicios como pagados en consultas_deuda:            │
│    UPDATE consultas_deuda SET pagado=true, voucher_id=X, ...    │
│                                                                 │
│ 5. Crear payouts pendientes:                                    │
│    - Payout PROPIETARIO: arriendo - comisión                    │
│    - Payout ADMINISTRACION: comisión                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo 6: Payouts (Distribución de Dinero)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESO DE PAYOUTS                           │
├─────────────────────────────────────────────────────────────────┤
│ Contexto:                                                       │
│ - El dinero llega a cuenta personal del admin                   │
│ - Admin transfiere a cuenta ETPAY (manual, fin del día)         │
│ - Desde ETPAY se ejecutan transferencias vía API                │
│                                                                 │
│ Flujo:                                                          │
│                                                                 │
│ 1. Al recibir pago → Crear payouts con estado 'PENDIENTE'       │
│                                                                 │
│ 2. Admin ejecuta proceso de transferencia:                      │
│    a. Selecciona payouts pendientes                             │
│    b. Calcula total a transferir a ETPAY                        │
│    c. Hace transferencia manual a cuenta ETPAY                  │
│                                                                 │
│ 3. Una vez fondos en ETPAY:                                     │
│    POST /api/payouts/ejecutar                                   │
│    a. Por cada payout pendiente:                                │
│       - Llamar API ETPAY para transferir                        │
│       - Actualizar estado = 'EN_PROCESO'                        │
│       - Guardar etpay_transfer_id                               │
│                                                                 │
│ 4. Webhook ETPAY (transferencia completada):                    │
│    - Actualizar estado = 'COMPLETADO'                           │
│    - Guardar fecha_ejecucion                                    │
│                                                                 │
│ 5. Si falla:                                                    │
│    - estado = 'FALLIDO'                                         │
│    - error_mensaje = detalle                                    │
│    - reintentos++                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Cálculo de Multas

Las multas se calculan **on-demand** usando la función `calcular_multa_voucher`:

```sql
-- Fórmula:
multa = monto_arriendo_clp × (tasa_anual / 100 / 365) × dias_atraso

-- Donde:
dias_atraso = CURRENT_DATE - (fecha_vencimiento + dias_gracia)

-- Si existe multa_maxima en el contrato:
multa = MIN(multa_calculada, multa_maxima)
```

**Ejemplo**:
- Arriendo: $500.000 CLP
- Tasa anual: 47%
- Días de atraso: 10 (después de gracia)
- Multa = 500.000 × (0.47 / 365) × 10 = $6.438

**Ventajas de on-demand**:
- Sin cron adicional para actualizar multas
- Siempre preciso al momento de consultar
- Config del contrato puede cambiar sin afectar vouchers históricos

## Estructura de `detalle_pago`

Cuando se procesa un pago, se guarda el desglose completo:

```json
{
  "arriendo": {
    "moneda": "CLP",
    "monto": 500000
  },
  "items_bitacora": [
    {
      "id": "uuid",
      "descripcion": "Reparación puerta",
      "tipo": "cargo",
      "monto": 15000
    },
    {
      "id": "uuid",
      "descripcion": "Descuento promocional",
      "tipo": "descuento",
      "monto": 5000
    }
  ],
  "multa": {
    "dias_atraso": 5,
    "tasa_anual": 47,
    "monto": 3219
  },
  "servicios_basicos": [
    {
      "servicio_id": 89,
      "consulta_id": "uuid",
      "tipo": "Agua",
      "compania": "Aguas Andinas",
      "monto": 30290
    }
  ],
  "subtotales": {
    "arriendo": 500000,
    "cargos": 15000,
    "descuentos": 5000,
    "multa": 3219,
    "servicios": 30290
  },
  "total": 543509
}
```

## Integraciones con Otros Módulos

### Conexión con Módulo de Contratos

**Tipo**: Consume datos

**Descripción**:
- Vouchers se generan desde contratos VIGENTES
- `config_version_usada` referencia a `contratos_config_historico`
- Configuración de multas, comisiones y calendario viene del contrato

**Ejemplo**:

```tsx
// Al generar voucher
const { data: config } = await supabase
  .from('contratos_config_historico')
  .select('*')
  .eq('contrato_id', contratoId)
  .is('vigente_hasta', null)
  .single();

const voucher = await supabase
  .from('vouchers')
  .insert({
    contrato_id: contratoId,
    config_version_usada: config.version,
    monto_arriendo: config.monto_arriendo,
    // ...
  });
```

### Conexión con Módulo de Servicios Básicos

**Tipo**: Consume datos + Actualiza estado

**Descripción**:
- Al generar voucher, se lanza bot para consultar deudas
- En portal de pago, se muestran servicios con deuda (donde `pagado = FALSE`)
- Al pagar, se actualiza `consultas_deuda` marcando como pagado
- El detalle de servicios pagados queda en `detalle_pago` del voucher (snapshot)

**Tablas involucradas**:
- `servicios`: Configuración de servicios por propiedad
- `consultas_deuda`: Historial de consultas del bot + campos de pago agregados

**Flujo de pago de servicios**:
```
Portal de pago → Selecciona servicios → Paga → detalle_pago (snapshot)
                                             → consultas_deuda.pagado = true
                                             → consultas_deuda.voucher_id = X
```

### Conexión con Módulo de Bitácora

**Tipo**: Consume datos

**Descripción**:
- Cargos/descuentos de bitácora se incluyen en el voucher al generar
- Se guardan como snapshot en `items_bitacora` (JSONB)
- Una vez incluidos, se marcan como procesados en bitácora

**Flujo**:

```
Bitácora → Cargo pendiente → Generar voucher → items_bitacora → Marcar procesado
```

## Tablas de Supabase Utilizadas

**Propias del módulo**:
- `vouchers`: Documentos de cobro
- `payouts`: Transferencias de dinero

**Alteradas por el módulo**:
- `consultas_deuda`: Se agregan campos `pagado`, `voucher_id`, `fecha_pago`

**Consumidas de otros módulos**:
- `contratos`: Referencia al contrato activo
- `contratos_config_historico`: Configuración de cobro, multas, comisiones
- `propiedades`: Datos de la propiedad
- `arrendatarios`: Datos del arrendatario
- `organizaciones`: Multi-tenancy
- `servicios`: Configuración de servicios básicos
- `consultas_deuda`: Deudas consultadas por el bot
- `cuentas_bancarias`: Cuentas para payouts

## Tipos TypeScript

```typescript
import { Database } from "@/lib/types/database.types";

// Tipos base de Supabase
type Voucher = Database["public"]["Tables"]["vouchers"]["Row"];
type VoucherInsert = Database["public"]["Tables"]["vouchers"]["Insert"];
type VoucherUpdate = Database["public"]["Tables"]["vouchers"]["Update"];

type Payout = Database["public"]["Tables"]["payouts"]["Row"];
type PayoutInsert = Database["public"]["Tables"]["payouts"]["Insert"];

// Enum de estados
type EstadoVoucher = "GENERADO" | "ENVIADO" | "VENCIDO" | "PAGADO" | "ANULADO";
type EstadoPayout = "PENDIENTE" | "EN_PROCESO" | "COMPLETADO" | "FALLIDO";
type TipoPayout = "PROPIETARIO" | "ADMINISTRACION";

// Tipos custom
interface ItemBitacora {
  id: string;
  monto: number;
  descripcion: string;
  tipo: "cargo" | "descuento";
}

interface DetallePago {
  arriendo: {
    moneda: "CLP" | "UF";
    monto: number;
  };
  items_bitacora: ItemBitacora[];
  multa: {
    dias_atraso: number;
    tasa_anual: number;
    monto: number;
  } | null;
  servicios_basicos: {
    servicio_id: number;
    consulta_id: string;
    tipo: string;
    compania: string;
    monto: number;
  }[];
  subtotales: {
    arriendo: number;
    cargos: number;
    descuentos: number;
    multa: number;
    servicios: number;
  };
  total: number;
}

interface VoucherPagoView extends Voucher {
  total_cargos: number;
  total_descuentos: number;
  dias_atraso: number;
  monto_multa: number;
  direccion: string;
  numero: string;
  depto: string | null;
  comuna: string;
  ciudad: string;
  arrendatario_id: string;
  arrendatario_nombre: string;
  arrendatario_email: string;
  arrendatario_telefono: string | null;
}

interface ServicioDeudaActual {
  servicio_id: number;
  propiedad_id: number;
  tipo_servicio: string;
  compania: string;
  activo: boolean;
  consulta_id: string | null;
  monto_deuda: number | null;
  fecha_consulta: string | null;
}

// Tipos para requests
interface IniciarPagoRequest {
  voucher_id: string;
  servicios_seleccionados: number[];
}

interface IniciarPagoResponse {
  url_pago: string;
  monto_total: number;
}
```

## Validaciones (Zod)

```typescript
import { z } from "zod";

const iniciarPagoSchema = z.object({
  voucher_id: z.string().uuid(),
  servicios_seleccionados: z.array(z.number().int().positive()),
});

const webhookEtpaySchema = z.object({
  token: z.string(),
  payment_id: z.string(),
  status: z.enum(["success", "failed", "pending"]),
  amount: z.number(),
  // ... otros campos según documentación ETPAY
});
```

## Consideraciones Importantes

### Seguridad

- **RLS habilitado**: Todas las tablas filtran por `organizacion_id`
- **Validación de montos**: Siempre recalcular en backend, no confiar en frontend
- **Webhook signatures**: Validar firmas de ETPAY antes de procesar
- **Portal público**: El link `/pago/{voucher_id}` es público pero solo permite pagar ese voucher específico

### Performance

- **Índices optimizados**: Para queries de cron (pendientes envío, por vencer)
- **Función STABLE**: `calcular_multa_voucher` está marcada como STABLE para caching
- **Vista materializada**: Considerar para `voucher_pago_view` si hay mucho volumen

### Integridad de Datos

- **Snapshots inmutables**: `config_version_usada`, `items_bitacora`, `detalle_pago` no cambian
- **Un voucher por periodo**: Constraint `UNIQUE(propiedad_id, periodo)`
- **Folio único**: Constraint `UNIQUE` en folio
- **Referencias protegidas**: `ON DELETE RESTRICT` para evitar huérfanos

### Cálculos Críticos

- **Multas precisas**: Función SQL centralizada, no duplicar lógica
- **Conversión UF**: Siempre guardar `monto_arriendo_clp` para base de multas
- **Redondeo**: Sin decimales para CLP (ROUND a 0)

## Cron Jobs Requeridos

| Cron | Horario | Descripción |
|------|---------|-------------|
| Generar vouchers | 00:00 Chile | Crea vouchers donde `dia_generacion = HOY` |
| Enviar emails | 08:00 Chile | Envía vouchers donde `fecha_envio_programada <= HOY` |
| Marcar vencidos | 00:05 Chile | Actualiza estado a VENCIDO donde `fecha_vencimiento < HOY` |
| Recordatorios | 10:00 Chile | (Opcional) Envía recordatorios de pago próximo a vencer |

## Pendientes / TODOs

- [ ] Implementar cron de generación de vouchers
- [ ] Crear portal de pago público
- [ ] Integrar ETPAY para cobros
- [ ] Implementar webhooks de ETPAY
- [ ] Crear proceso de payouts
- [ ] Implementar envío de emails (Resend/n8n)
- [ ] Crear dashboard de vouchers para admin
- [ ] Implementar recordatorios automáticos
- [ ] Agregar reportes de cobranza
- [ ] Integrar con módulo de bitácora (cargos/descuentos)

## Decisiones de Diseño Clave

### ¿Por qué multas on-demand en vez de cron diario?

**Razón**: Simplicidad y precisión.

- Evita un cron adicional solo para actualizar un campo
- La multa siempre es exacta al momento de consultar
- Si el admin cambia la tasa en el contrato, vouchers ya generados usan su `config_version_usada`

### ¿Por qué snapshot de items_bitacora en JSONB?

**Razón**: Inmutabilidad y trazabilidad.

- Los cargos/descuentos originales pueden modificarse o eliminarse
- El voucher necesita recordar exactamente qué se cobró
- Evita JOINs complejos al consultar

### ¿Por qué no crear tabla separada para servicios pagados?

**Razón**: Simplicidad y reutilización.

- `detalle_pago` en voucher ya guarda el snapshot de servicios pagados
- `consultas_deuda` ya existe, solo se agregan 3 campos para trazabilidad
- Evita una tabla adicional que duplicaría información
- Consulta simple: `SELECT * FROM consultas_deuda WHERE voucher_id = X`

### ¿Por qué el folio usa propiedad_id y no UUID?

**Razón**: Legibilidad.

- `FOLIO-87-2024-05` es más fácil de comunicar que `FOLIO-abc123ef-2024-05`
- El `propiedad_id` es numérico y corto
- El `voucher_id` (UUID) se usa internamente para URLs y APIs

## Changelog

### 2025-12-18 - v1.0

- **Agregado**: Schema inicial con 2 tablas (vouchers, payouts)
- **Agregado**: Alteración de `consultas_deuda` para tracking de pagos de servicios
- **Agregado**: Función `calcular_multa_voucher` para cálculo on-demand
- **Agregado**: Vistas `voucher_pago_view`, `servicios_deuda_actual`, `payouts_resumen`
- **Agregado**: RLS completo por organización
- **Agregado**: Documentación completa del módulo

---

**Última actualización**: 2025-12-18
**Mantenido por**: Sistema Real State Pro
