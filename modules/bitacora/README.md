# Módulo: Bitácora de Propiedades

> **Hoja de vida de cada propiedad**
> Registro histórico de eventos, cargos y descuentos aplicables a vouchers

## Descripción General

El módulo de Bitácora es el registro histórico de todos los sucesos relevantes de una propiedad. Funciona como la "hoja de vida" de cada inmueble, permitiendo documentar eventos como reparaciones, visitas, incidentes, y cualquier situación que los administradores consideren importante.

Además de ser un registro informativo, la bitácora permite generar **cargos** y **descuentos** que se aplican automáticamente a los vouchers de cobro. Esto permite, por ejemplo, cobrar reparaciones causadas por el arrendatario o aplicar descuentos por pagos que no correspondían.

## Ubicación

```
modules/bitacora/
  ├── migration.sql    # Schema de base de datos
  └── README.md        # Esta documentación
```

## Responsabilidades

- **Registrar eventos**: Documentar sucesos importantes de cada propiedad
- **Gestionar archivos**: Adjuntar fotos, facturas, PDFs como respaldo
- **Crear cargos**: Generar cobros adicionales para vouchers
- **Crear descuentos**: Aplicar rebajas a vouchers futuros
- **Configurar cuotas**: Dividir cargos grandes en múltiples vouchers
- **Seguimiento**: Agregar notas a eventos ya pagados

## Estructura de Base de Datos

### Arquitectura: 3 Tablas

```
categorias_bitacora (catálogo)
├── Categorías predefinidas del sistema
└── Categorías personalizadas por organización

bitacora_propiedades (principal)
├── Eventos registrados
├── Cargos/descuentos configurados
├── Estado del cobro
└── Configuración de cuotas

bitacora_archivos (adjuntos)
├── Archivos vinculados a eventos
└── Metadata de archivos
```

### 1. `categorias_bitacora` (Catálogo de categorías)

```sql
categorias_bitacora:
  - categoria_id (PK, UUID)
  - organizacion_id (FK, nullable) -- NULL = predefinida del sistema

  -- Datos
  - nombre (VARCHAR 50)
  - descripcion (TEXT, nullable)
  - icono (VARCHAR 50, nullable) -- Nombre del icono (lucide/tabler)
  - color (VARCHAR 7, nullable) -- Hex color para UI

  -- Control
  - es_sistema (BOOLEAN) -- TRUE = no eliminable
  - activa (BOOLEAN DEFAULT TRUE)

  - created_at
```

**Categorías predefinidas del sistema** (es_sistema = TRUE):

| Nombre | Descripción | Icono sugerido |
|--------|-------------|----------------|
| Reparación | Arreglos y mantenimientos | `wrench` |
| Visita | Inspecciones y visitas | `eye` |
| Incidente | Problemas o emergencias | `alert-triangle` |
| Administrativo | Trámites y gestiones | `file-text` |
| Nota | Observaciones generales | `sticky-note` |
| Pago | Relacionado con pagos | `credit-card` |

### 2. `bitacora_propiedades` (Tabla principal)

```sql
bitacora_propiedades:
  - bitacora_id (PK, UUID)
  - organizacion_id (FK)
  - propiedad_id (FK)
  - contrato_id (FK, nullable) -- Contrato vigente al momento del evento

  -- Evento
  - categoria_id (FK)
  - titulo (VARCHAR 200)
  - descripcion (TEXT, nullable)
  - fecha_evento (DATE) -- Cuándo ocurrió el evento

  -- Cargo/Descuento (opcional)
  - tipo_movimiento (ENUM: null, 'cargo', 'descuento')
  - monto_total (NUMERIC 12,2, nullable) -- Monto total del cargo/descuento
  - moneda (ENUM: 'CLP', 'UF', default 'CLP')

  -- Configuración de aplicación
  - modo_aplicacion (ENUM: 'proximo', 'periodo', 'cuotas')
  - periodo_objetivo (VARCHAR 7, nullable) -- YYYY-MM para modo 'periodo'
  - numero_cuotas (INT, nullable) -- Para modo 'cuotas'
  - cuotas_restantes (INT, nullable) -- Cuántas cuotas faltan por aplicar
  - monto_por_cuota (NUMERIC 12,2, nullable) -- monto_total / numero_cuotas

  -- Estado
  - estado (ENUM: 'pendiente', 'parcial', 'aplicado', 'cancelado')
  -- pendiente: No se ha aplicado a ningún voucher
  -- parcial: Algunas cuotas aplicadas (para modo cuotas)
  -- aplicado: Completamente aplicado/pagado
  -- cancelado: Cancelado antes de aplicar

  -- Seguimiento post-pago
  - notas_seguimiento (TEXT, nullable) -- Notas adicionales después del pago

  -- Auditoría
  - created_at
  - created_by (FK users)
  - updated_at
  - updated_by (FK users, nullable)
```

**Estados del movimiento**:

| Estado | Descripción |
|--------|-------------|
| `pendiente` | Cargo/descuento creado, esperando aplicarse a voucher |
| `parcial` | Algunas cuotas ya aplicadas, faltan más |
| `aplicado` | Completamente cobrado/descontado |
| `cancelado` | Cancelado manualmente antes de aplicar |

**Modos de aplicación**:

| Modo | Descripción | Campos requeridos |
|------|-------------|-------------------|
| `proximo` | Se aplica al próximo voucher que se genere | Ninguno adicional |
| `periodo` | Se aplica al voucher de un período específico | `periodo_objetivo` |
| `cuotas` | Se divide en N vouchers consecutivos | `numero_cuotas` |

### 3. `bitacora_archivos` (Archivos adjuntos)

```sql
bitacora_archivos:
  - archivo_id (PK, UUID)
  - bitacora_id (FK)

  -- Archivo
  - nombre_original (VARCHAR 255)
  - nombre_storage (VARCHAR 255) -- Nombre en Supabase Storage
  - tipo_mime (VARCHAR 100)
  - tamaño_bytes (BIGINT)
  - url_publica (TEXT) -- URL firmada o pública

  -- Metadata
  - descripcion (TEXT, nullable)

  - created_at
  - created_by (FK users)
```

### 4. `bitacora_voucher` (Tabla de relación para tracking)

```sql
bitacora_voucher:
  - id (PK, UUID)
  - bitacora_id (FK)
  - voucher_id (FK)

  -- Datos del momento de aplicación
  - cuota_numero (INT, nullable) -- Número de cuota (1, 2, 3...)
  - monto_aplicado (NUMERIC 12,2) -- Monto de esta aplicación

  -- Estado
  - estado (ENUM: 'aplicado', 'pagado')
  -- aplicado: Incluido en voucher, pendiente de pago
  -- pagado: Voucher fue pagado

  - fecha_aplicacion (TIMESTAMPTZ)
  - fecha_pago (TIMESTAMPTZ, nullable)
```

**Nota**: Esta tabla permite:
- Trackear qué cargos están en qué vouchers
- Manejar cuotas (múltiples registros para una bitácora)
- Saber cuándo se pagó cada cuota

## Vistas

### 1. `voucher_cargos_pendientes` (Para portal de pago)

Vista que une vouchers no pagados con sus cargos/descuentos de bitácora:

```sql
CREATE VIEW voucher_cargos_pendientes AS
SELECT
  v.voucher_id,
  v.folio,
  v.periodo,
  v.estado as estado_voucher,

  -- Datos de bitácora
  bv.id as bitacora_voucher_id,
  b.bitacora_id,
  b.titulo,
  b.descripcion,
  b.tipo_movimiento,
  bv.monto_aplicado,
  b.moneda,
  bv.cuota_numero,
  b.numero_cuotas,

  -- Categoría
  c.nombre as categoria_nombre,
  c.icono as categoria_icono,
  c.color as categoria_color

FROM vouchers v
JOIN bitacora_voucher bv ON bv.voucher_id = v.voucher_id
JOIN bitacora_propiedades b ON b.bitacora_id = bv.bitacora_id
JOIN categorias_bitacora c ON c.categoria_id = b.categoria_id
WHERE v.estado IN ('GENERADO', 'ENVIADO', 'VENCIDO')
  AND bv.estado = 'aplicado';
```

### 2. `bitacora_por_aplicar` (Para generación de vouchers)

Vista de cargos/descuentos pendientes de aplicar:

```sql
CREATE VIEW bitacora_por_aplicar AS
SELECT
  b.*,
  c.nombre as categoria_nombre,
  p.direccion,
  cont.arrendatario_id
FROM bitacora_propiedades b
JOIN categorias_bitacora c ON c.categoria_id = b.categoria_id
JOIN propiedades p ON p.propiedad_id = b.propiedad_id
LEFT JOIN contratos cont ON cont.contrato_id = b.contrato_id
WHERE b.tipo_movimiento IS NOT NULL
  AND b.estado IN ('pendiente', 'parcial')
  AND (
    -- Modo próximo: siempre listo para aplicar
    b.modo_aplicacion = 'proximo'
    OR
    -- Modo período: cuando llegue el período
    (b.modo_aplicacion = 'periodo' AND b.periodo_objetivo <= TO_CHAR(CURRENT_DATE, 'YYYY-MM'))
    OR
    -- Modo cuotas: mientras queden cuotas
    (b.modo_aplicacion = 'cuotas' AND b.cuotas_restantes > 0)
  );
```

## Flujos de Datos

### Flujo 1: Crear Evento Simple (Sin Cargo)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CREAR EVENTO INFORMATIVO                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. Admin selecciona propiedad                                   │
│                                                                 │
│ 2. Completa formulario:                                         │
│    - Categoría (predefinida o custom)                           │
│    - Título                                                     │
│    - Descripción                                                │
│    - Fecha del evento                                           │
│    - Archivos adjuntos (opcional)                               │
│                                                                 │
│ 3. Sistema guarda:                                              │
│    INSERT INTO bitacora_propiedades (                           │
│      propiedad_id,                                              │
│      contrato_id = contrato_actual,                             │
│      tipo_movimiento = NULL, -- Sin cargo/descuento             │
│      estado = 'aplicado' -- No requiere acción                  │
│    )                                                            │
│                                                                 │
│ 4. Si hay archivos:                                             │
│    - Subir a Supabase Storage                                   │
│    - INSERT INTO bitacora_archivos                              │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo 2: Crear Evento con Cargo (Próximo Voucher)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CREAR EVENTO CON CARGO                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Admin crea evento con cargo:                                 │
│    - tipo_movimiento = 'cargo'                                  │
│    - monto_total = 150000                                       │
│    - modo_aplicacion = 'proximo'                                │
│    - estado = 'pendiente'                                       │
│                                                                 │
│ 2. Cargo queda pendiente de aplicar                             │
│                                                                 │
│ 3. Cron de generación de vouchers (día 28):                     │
│    a. Genera voucher para el período                            │
│    b. Consulta vista `bitacora_por_aplicar`                     │
│    c. Por cada cargo pendiente del contrato:                    │
│       INSERT INTO bitacora_voucher (                            │
│         bitacora_id,                                            │
│         voucher_id,                                             │
│         monto_aplicado = 150000,                                │
│         estado = 'aplicado'                                     │
│       )                                                         │
│    d. UPDATE bitacora SET estado = 'aplicado'                   │
│                                                                 │
│ 4. Voucher generado incluye el cargo vía vista                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo 3: Crear Cargo en Cuotas

```
┌─────────────────────────────────────────────────────────────────┐
│                    CARGO EN 3 CUOTAS                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Admin crea cargo:                                            │
│    - monto_total = 300000                                       │
│    - modo_aplicacion = 'cuotas'                                 │
│    - numero_cuotas = 3                                          │
│    - cuotas_restantes = 3                                       │
│    - monto_por_cuota = 100000                                   │
│    - estado = 'pendiente'                                       │
│                                                                 │
│ 2. Voucher Enero (primera cuota):                               │
│    INSERT INTO bitacora_voucher (                               │
│      cuota_numero = 1,                                          │
│      monto_aplicado = 100000                                    │
│    )                                                            │
│    UPDATE bitacora SET                                          │
│      cuotas_restantes = 2,                                      │
│      estado = 'parcial'                                         │
│                                                                 │
│ 3. Voucher Febrero (segunda cuota):                             │
│    INSERT INTO bitacora_voucher (cuota_numero = 2, ...)         │
│    UPDATE bitacora SET cuotas_restantes = 1                     │
│                                                                 │
│ 4. Voucher Marzo (última cuota):                                │
│    INSERT INTO bitacora_voucher (cuota_numero = 3, ...)         │
│    UPDATE bitacora SET                                          │
│      cuotas_restantes = 0,                                      │
│      estado = 'aplicado'                                        │
│                                                                 │
│ Portal de pago muestra:                                         │
│ "Cuota 2/3 - Reparación cañería: $100.000"                      │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo 4: Pago de Voucher (Integración con Módulo de Pagos)

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOK PAGO EXITOSO                         │
├─────────────────────────────────────────────────────────────────┤
│ 1. ETPAY envía webhook de pago exitoso                          │
│                                                                 │
│ 2. Obtener cargos/descuentos del voucher:                       │
│    SELECT * FROM voucher_cargos_pendientes                      │
│    WHERE voucher_id = X                                         │
│                                                                 │
│ 3. Crear snapshot en voucher.items_bitacora:                    │
│    {                                                            │
│      "cargos": [                                                │
│        {                                                        │
│          "bitacora_id": "uuid",                                 │
│          "titulo": "Reparación cañería",                        │
│          "descripcion": "...",                                  │
│          "monto": 100000,                                       │
│          "cuota": "2/3"                                         │
│        }                                                        │
│      ],                                                         │
│      "descuentos": [...]                                        │
│    }                                                            │
│                                                                 │
│ 4. Actualizar bitacora_voucher:                                 │
│    UPDATE SET estado = 'pagado', fecha_pago = NOW()             │
│                                                                 │
│ 5. Si era última cuota, actualizar bitácora:                    │
│    UPDATE bitacora SET estado = 'aplicado'                      │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo 5: Cancelar Cargo Pendiente

```
┌─────────────────────────────────────────────────────────────────┐
│                    CANCELAR CARGO                               │
├─────────────────────────────────────────────────────────────────┤
│ Precondición: Cargo en estado 'pendiente' o 'parcial'           │
│                                                                 │
│ 1. Si está vinculado a voucher no pagado:                       │
│    DELETE FROM bitacora_voucher                                 │
│    WHERE bitacora_id = X AND estado = 'aplicado'                │
│                                                                 │
│ 2. Actualizar bitácora:                                         │
│    UPDATE bitacora SET estado = 'cancelado'                     │
│                                                                 │
│ Nota: Si alguna cuota ya fue pagada (estado = 'pagado'),        │
│ solo se cancelan las cuotas pendientes, no las pagadas.         │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo 6: Contrato Termina con Cuotas Pendientes

```
┌─────────────────────────────────────────────────────────────────┐
│                    TÉRMINO DE CONTRATO                          │
├─────────────────────────────────────────────────────────────────┤
│ Cuando un contrato pasa a estado TERMINADO:                     │
│                                                                 │
│ 1. Buscar cargos/descuentos pendientes del contrato:            │
│    SELECT * FROM bitacora_propiedades                           │
│    WHERE contrato_id = X                                        │
│    AND estado IN ('pendiente', 'parcial')                       │
│                                                                 │
│ 2. Por cada cargo pendiente:                                    │
│    - Eliminar vínculos no pagados de bitacora_voucher           │
│    - Marcar como cancelado                                      │
│    - Agregar nota: "Cancelado por término de contrato"          │
│                                                                 │
│ Nota: Los cargos ya pagados permanecen en su estado.            │
│ El evento de bitácora sigue visible en el historial             │
│ de la propiedad (vinculado al contrato anterior).               │
└─────────────────────────────────────────────────────────────────┘
```

## Integraciones con Otros Módulos

### Conexión con Módulo de Pagos

**Tipo**: Provee datos + Recibe confirmación

**Descripción**:
- Bitácora provee cargos/descuentos pendientes vía vista `voucher_cargos_pendientes`
- Al generar voucher, sistema consulta `bitacora_por_aplicar` y crea registros en `bitacora_voucher`
- Portal de pago muestra desglose de cargos/descuentos
- Al confirmar pago, se actualiza estado en bitácora y se guarda snapshot en voucher

**Flujo de datos**:
```
Bitácora ──> bitacora_voucher ──> Vista ──> Portal de Pago
                                                  │
                                                  ▼ (pago)

voucher.items_bitacora ◄── Snapshot
bitacora_voucher.estado = 'pagado'
```

### Conexión con Módulo de Contratos

**Tipo**: Consume datos

**Descripción**:
- Cada evento se vincula al contrato vigente al momento de creación
- Si el contrato termina, los cargos pendientes se cancelan
- El evento permanece visible en el historial de la propiedad

**Ejemplo**:
```tsx
// Al crear evento, obtener contrato actual
const { data: propiedad } = await supabase
  .from('propiedades')
  .select('contrato_actual_id')
  .eq('propiedad_id', propiedadId)
  .single();

await supabase
  .from('bitacora_propiedades')
  .insert({
    propiedad_id: propiedadId,
    contrato_id: propiedad.contrato_actual_id, // Puede ser null
    // ...
  });
```

### Conexión con Módulo de Propiedades

**Tipo**: Consume datos

**Descripción**:
- Cada evento pertenece a una propiedad específica
- La bitácora es la "hoja de vida" de la propiedad
- Eventos persisten aunque cambien arrendatarios/contratos

## Tablas de Supabase Utilizadas

**Propias del módulo**:
- `categorias_bitacora`: Catálogo de categorías
- `bitacora_propiedades`: Eventos registrados
- `bitacora_archivos`: Archivos adjuntos
- `bitacora_voucher`: Relación con vouchers

**Consumidas de otros módulos**:
- `propiedades`: Propiedad del evento
- `contratos`: Contrato vigente al momento
- `vouchers`: Vouchers donde se aplican cargos
- `organizaciones`: Multi-tenancy
- `users`: Auditoría

## Tipos TypeScript

```typescript
import { Database } from "@/lib/types/database.types";

// Tipos base de Supabase
type CategoriaBitacora = Database["public"]["Tables"]["categorias_bitacora"]["Row"];
type BitacoraPropiedad = Database["public"]["Tables"]["bitacora_propiedades"]["Row"];
type BitacoraArchivo = Database["public"]["Tables"]["bitacora_archivos"]["Row"];
type BitacoraVoucher = Database["public"]["Tables"]["bitacora_voucher"]["Row"];

// Enums
type TipoMovimiento = "cargo" | "descuento" | null;
type ModoAplicacion = "proximo" | "periodo" | "cuotas";
type EstadoBitacora = "pendiente" | "parcial" | "aplicado" | "cancelado";
type EstadoBitacoraVoucher = "aplicado" | "pagado";

// Tipos para creación
interface CreateBitacoraData {
  propiedad_id: string;
  categoria_id: string;
  titulo: string;
  descripcion?: string;
  fecha_evento: string;

  // Cargo/Descuento (opcional)
  tipo_movimiento?: TipoMovimiento;
  monto_total?: number;
  moneda?: "CLP" | "UF";

  // Configuración de aplicación
  modo_aplicacion?: ModoAplicacion;
  periodo_objetivo?: string; // YYYY-MM
  numero_cuotas?: number;
}

interface CreateArchivoData {
  bitacora_id: string;
  file: File;
  descripcion?: string;
}

// Tipos para vistas
interface VoucherCargoPendiente {
  voucher_id: string;
  folio: string;
  periodo: string;
  estado_voucher: string;

  bitacora_voucher_id: string;
  bitacora_id: string;
  titulo: string;
  descripcion: string | null;
  tipo_movimiento: TipoMovimiento;
  monto_aplicado: number;
  moneda: "CLP" | "UF";
  cuota_numero: number | null;
  numero_cuotas: number | null;

  categoria_nombre: string;
  categoria_icono: string | null;
  categoria_color: string | null;
}

// Tipo para snapshot en voucher.items_bitacora
interface ItemsBitacoraSnapshot {
  cargos: {
    bitacora_id: string;
    titulo: string;
    descripcion: string | null;
    monto: number;
    cuota: string | null; // "2/3" o null
  }[];
  descuentos: {
    bitacora_id: string;
    titulo: string;
    descripcion: string | null;
    monto: number;
    cuota: string | null;
  }[];
  total_cargos: number;
  total_descuentos: number;
}

// Tipo extendido para UI
interface BitacoraConDetalles extends BitacoraPropiedad {
  categoria: CategoriaBitacora;
  archivos: BitacoraArchivo[];
  aplicaciones: BitacoraVoucher[];
  propiedad: {
    direccion: string;
    numero: string;
  };
  contrato: {
    arrendatario: {
      nombre: string;
    };
  } | null;
}
```

## Validaciones (Zod)

```typescript
import { z } from "zod";

const tipoMovimientoEnum = z.enum(["cargo", "descuento"]).nullable();
const modoAplicacionEnum = z.enum(["proximo", "periodo", "cuotas"]);
const monedaEnum = z.enum(["CLP", "UF"]);

// Schema para crear evento
const createBitacoraSchema = z.object({
  propiedad_id: z.string().uuid(),
  categoria_id: z.string().uuid(),
  titulo: z.string().min(1).max(200),
  descripcion: z.string().optional(),
  fecha_evento: z.string().date(),

  // Cargo/Descuento
  tipo_movimiento: tipoMovimientoEnum.optional(),
  monto_total: z.number().positive().optional(),
  moneda: monedaEnum.default("CLP"),

  // Aplicación
  modo_aplicacion: modoAplicacionEnum.optional(),
  periodo_objetivo: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  numero_cuotas: z.number().int().min(2).max(24).optional(),
})
.refine(
  (data) => {
    // Si hay tipo_movimiento, debe haber monto
    if (data.tipo_movimiento && !data.monto_total) {
      return false;
    }
    return true;
  },
  { message: "monto_total es requerido cuando hay cargo/descuento" }
)
.refine(
  (data) => {
    // Si hay monto, debe haber modo_aplicacion
    if (data.monto_total && !data.modo_aplicacion) {
      return false;
    }
    return true;
  },
  { message: "modo_aplicacion es requerido para cargos/descuentos" }
)
.refine(
  (data) => {
    // Si modo es 'periodo', debe haber periodo_objetivo
    if (data.modo_aplicacion === "periodo" && !data.periodo_objetivo) {
      return false;
    }
    return true;
  },
  { message: "periodo_objetivo es requerido para modo 'periodo'" }
)
.refine(
  (data) => {
    // Si modo es 'cuotas', debe haber numero_cuotas
    if (data.modo_aplicacion === "cuotas" && !data.numero_cuotas) {
      return false;
    }
    return true;
  },
  { message: "numero_cuotas es requerido para modo 'cuotas'" }
);

// Schema para editar evento (solo campos editables)
const updateBitacoraSchema = z.object({
  titulo: z.string().min(1).max(200).optional(),
  descripcion: z.string().optional(),
  fecha_evento: z.string().date().optional(),
  categoria_id: z.string().uuid().optional(),

  // Solo editable si estado es 'pendiente'
  monto_total: z.number().positive().optional(),
  modo_aplicacion: modoAplicacionEnum.optional(),
  periodo_objetivo: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  numero_cuotas: z.number().int().min(2).max(24).optional(),
});

// Schema para notas de seguimiento (post-pago)
const addNotaSchema = z.object({
  notas_seguimiento: z.string().min(1),
});

// Schema para categoría personalizada
const createCategoriaSchema = z.object({
  nombre: z.string().min(1).max(50),
  descripcion: z.string().optional(),
  icono: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});
```

## Consideraciones Importantes

### Seguridad

- **RLS habilitado**: Todas las tablas filtran por `organizacion_id`
- **Auditoría completa**: `created_by` y `updated_by` en todos los registros
- **Archivos seguros**: URLs firmadas con expiración para archivos privados
- **Validación de estado**: No permitir editar cargos ya pagados

### Performance

- **Índices optimizados**:
  - `idx_bitacora_propiedad` para listar eventos por propiedad
  - `idx_bitacora_pendientes` para buscar cargos pendientes
  - `idx_bitacora_voucher` para relacionar con vouchers
- **Vistas materializadas**: Considerar si el volumen crece

### Integridad de Datos

- **Snapshot inmutable**: `items_bitacora` en voucher no cambia post-pago
- **Contrato nullable**: Evento puede existir sin contrato (propiedad vacía)
- **Cascadas controladas**: Archivos se eliminan con el evento
- **Estados coherentes**: Triggers para mantener consistencia

### Archivos

- **Storage**: Usar Supabase Storage bucket `bitacora-archivos`
- **Organización**: `{organizacion_id}/{propiedad_id}/{bitacora_id}/{archivo}`
- **Tipos permitidos**: Imágenes, PDFs, documentos Office
- **Sin límite de tamaño**: Pero considerar límites de Supabase

## Pendientes / TODOs

- [ ] Crear migration.sql con todas las tablas
- [ ] Implementar RLS policies
- [ ] Crear triggers para auto-calcular monto_por_cuota
- [ ] Crear trigger para cancelar cargos al terminar contrato
- [ ] Implementar UI de listado de bitácora por propiedad
- [ ] Implementar formulario de creación de eventos
- [ ] Implementar carga de archivos a Storage
- [ ] Crear componente de visualización de cargos en portal de pago
- [ ] Integrar con cron de generación de vouchers
- [ ] Implementar cancelación de cargos
- [ ] Agregar notas de seguimiento post-pago

## Decisiones de Diseño Clave

### ¿Por qué tabla separada `bitacora_voucher`?

**Razón**: Manejo de cuotas y trazabilidad.

- Una bitácora con 3 cuotas genera 3 registros en `bitacora_voucher`
- Cada registro tiene su propio estado (aplicado/pagado)
- Permite saber exactamente qué cuota se pagó en qué voucher
- Alternativa rechazada: Array de voucher_ids en bitácora → no permite trackear estado por cuota

### ¿Por qué snapshot en `items_bitacora` si ya existe la relación?

**Razón**: Inmutabilidad histórica.

- El voucher pagado debe mostrar exactamente lo que se cobró
- Si después editan la bitácora, el historial no debe cambiar
- `items_bitacora` es el registro legal de lo cobrado
- La relación `bitacora_voucher` es para tracking operativo

### ¿Por qué `contrato_id` nullable?

**Razón**: Propiedad puede no tener contrato activo.

- Evento puede registrarse cuando la propiedad está vacía
- Ejemplo: "Reparación antes de nuevo arriendo"
- El cargo no se aplicará hasta que haya un contrato
- Alternativa: Bloquear creación sin contrato → limita funcionalidad

### ¿Por qué modo_aplicacion en vez de solo fecha?

**Razón**: Flexibilidad y claridad.

- `proximo`: Simple, se aplica automáticamente
- `periodo`: Control exacto de cuándo cobrar
- `cuotas`: Divide automáticamente, sin cálculos manuales
- Alternativa: Solo fecha objetivo → no permite cuotas fácilmente

## Changelog

### 2025-12-21 - v1.0

- **Agregado**: Schema inicial con 4 tablas
- **Agregado**: Sistema de cuotas para cargos grandes
- **Agregado**: Categorías predefinidas y personalizadas
- **Agregado**: Integración con módulo de pagos vía vistas
- **Agregado**: Snapshot inmutable en vouchers pagados
- **Agregado**: Documentación completa del módulo

---

**Última actualización**: 2025-12-21
**Mantenido por**: Sistema Real State Pro
