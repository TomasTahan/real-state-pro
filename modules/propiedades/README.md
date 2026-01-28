# Módulo: Propiedades

> **Módulo base del sistema**
> Gestiona propiedades inmobiliarias y sus características físicas

## Descripción General

El módulo de Propiedades administra toda la información relacionada con las propiedades inmobiliarias que gestiona la organización. Almacena datos de ubicación, características físicas, y mantiene la relación con el contrato actual vigente y el propietario.

Este módulo sirve como base para el resto del sistema: cada propiedad puede tener múltiples contratos a lo largo del tiempo (histórico completo), eventos en la bitácora, servicios básicos configurados, y vouchers de cobro asociados.

## Ubicación

```
modules/propiedades/
  ├── MIGRATIONS.md         # Documentación de schema y migraciones
  └── README.md             # Esta documentación
```

## Responsabilidades

- **Gestión de propiedades**: Crear, editar y eliminar propiedades
- **Información física**: Administrar características (dormitorios, baños, superficies, etc.)
- **Ubicación**: Mantener datos completos de dirección (región, comuna, calle, número, bloque)
- **Relación con propietarios**: Vinculación con tabla `propietarios`
- **Relación con contratos**: Referencia al contrato actual vigente (`contrato_actual_id`)
- **Características flexibles**: Gestionar atributos variables mediante JSONB (piscina, vista mar, etc.)
- **Multi-tenancy**: Aislamiento por organización con RLS

## Estructura de Base de Datos

### Tabla Principal: `propiedades`

La tabla `propiedades` almacena toda la información relevante en una única tabla (relación 1:1):

```sql
propiedades:
  -- Identificadores
  - propiedad_id (PK, UUID)
  - organizacion_id (FK → orgs, NOT NULL)
  - propietario_id (FK → propietarios, NOT NULL)
  - contrato_actual_id (FK → contratos, NULLABLE)

  -- Ubicación
  - region (text, NOT NULL)
  - comuna (text, NOT NULL)
  - calle (text, NOT NULL)
  - numero (text, NOT NULL)
  - bloque (text, NULLABLE) -- Ej: "Torre A", "Block 3"

  -- Tipo y naturaleza
  - tipo_propiedad (text, NOT NULL) -- 'casa', 'departamento', 'oficina', 'local_comercial', 'bodega', 'estacionamiento'
  - naturaleza_propiedad (text, NULLABLE) -- 'urbana', 'rural'
  - rol (text, NULLABLE) -- Rol de avalúo fiscal
  - destino_arriendo (text, NULLABLE) -- 'habitacional', 'comercial', 'mixto'

  -- Características principales (siempre presentes)
  - dormitorios (integer, DEFAULT 0)
  - banos (integer, DEFAULT 0)
  - estacionamientos (integer, DEFAULT 0)
  - bodegas (integer, DEFAULT 0)

  -- Superficies (en m²)
  - superficie_util (numeric(10,2), DEFAULT 0)
  - superficie_terraza (numeric(10,2), NULLABLE, DEFAULT 0)
  - superficie_total (numeric(10,2), DEFAULT 0)

  -- Detalles de estacionamientos y bodegas
  - estacionamiento_numeros (text[], NULLABLE) -- ['E-12', 'E-13']
  - bodega_numeros (text[], NULLABLE) -- ['B-5']

  -- Estado de amoblado
  - amoblado (boolean, DEFAULT false)

  -- Características adicionales variables (JSONB)
  - caracteristicas (jsonb, DEFAULT '{}')

  -- Metadata
  - created_at (timestamptz, DEFAULT now())
  - updated_at (timestamptz, DEFAULT now())
```

### Características JSONB

El campo `caracteristicas` almacena atributos que varían según el tipo de propiedad:

```json
{
  "piscina": true,
  "vista_mar": true,
  "quincho": false,
  "gym": true,
  "seguridad_24h": true,
  "calefaccion_central": true,
  "aire_acondicionado": false,
  "ascensor": true,
  "permite_mascotas": true,
  "lavanderia": false,
  "jardin": true,
  "terraza_comun": false
}
```

### Relación con Otras Tablas

```
orgs (1) ──< (N) propiedades
propietarios (1) ──< (N) propiedades

propiedades (1) ──< (N) contratos (histórico completo)
propiedades (1) ──< (N) bitacora_propiedades
propiedades (1) ──< (N) servicios (agua, luz, gas)

propiedades >──(1) contratos (contrato_actual_id, nullable)
```

**Relación bidireccional con contratos**:
- `propiedades.contrato_actual_id` → `contratos.contrato_id` (acceso directo al contrato vigente)
- `contratos.propiedad_id` → `propiedades.propiedad_id` (histórico de todos los contratos)

## Flujos de Datos

### Flujo 1: Creación de Propiedad

1. Usuario completa formulario de nueva propiedad
2. Sistema valida datos requeridos
3. Crea registro en tabla `propiedades`:
   ```sql
   INSERT INTO propiedades (
     organizacion_id,
     propietario_id,
     region, comuna, calle, numero,
     tipo_propiedad,
     dormitorios, banos, estacionamientos, bodegas,
     superficie_util, superficie_total,
     caracteristicas,
     ...
   ) VALUES (...)
   ```
4. Trigger actualiza automáticamente `updated_at`
5. Opcionalmente, usuario puede crear contrato inmediatamente

**Diagrama**:
```
Usuario → Formulario → Validación → INSERT propiedad → Trigger updated_at → (Opcional) Crear contrato
```

### Flujo 2: Asignación de Contrato Actual

Cuando se crea un nuevo contrato para una propiedad:

1. Sistema crea contrato en tabla `contratos`
2. Actualiza `contrato_actual_id` en la propiedad:
   ```sql
   UPDATE propiedades
   SET contrato_actual_id = nuevo_contrato_id
   WHERE propiedad_id = X
   ```
3. Propiedad queda en estado "arrendada"

Cuando termina un contrato:

1. Sistema cambia estado del contrato a `TERMINADO`
2. Limpia referencia en propiedad:
   ```sql
   UPDATE propiedades
   SET contrato_actual_id = NULL
   WHERE propiedad_id = X
   ```
3. Propiedad queda en estado "disponible"

**Diagrama**:
```
Crear contrato → UPDATE propiedad.contrato_actual_id → Propiedad arrendada
Terminar contrato → UPDATE propiedad.contrato_actual_id = NULL → Propiedad disponible
```

### Flujo 3: Búsqueda de Propiedades

Búsquedas comunes optimizadas con índices:

```sql
-- Por organización (RLS automático)
SELECT * FROM propiedades WHERE organizacion_id = X

-- Por tipo de propiedad
SELECT * FROM propiedades WHERE tipo_propiedad = 'departamento'

-- Por comuna
SELECT * FROM propiedades WHERE comuna = 'Las Condes'

-- Propiedades disponibles (sin contrato)
SELECT * FROM propiedades WHERE contrato_actual_id IS NULL

-- Propiedades arrendadas
SELECT * FROM propiedades WHERE contrato_actual_id IS NOT NULL

-- Búsqueda por características JSONB
SELECT * FROM propiedades
WHERE caracteristicas->>'piscina' = 'true'

-- Búsqueda por múltiples características
SELECT * FROM propiedades
WHERE caracteristicas @> '{"piscina": true, "gym": true}'
```

### Flujo 4: Edición de Propiedad

1. Usuario modifica datos de propiedad
2. Sistema valida cambios
3. Actualiza registro:
   ```sql
   UPDATE propiedades
   SET
     dormitorios = X,
     superficie_util = Y,
     caracteristicas = Z,
     ...
   WHERE propiedad_id = W
   ```
4. Trigger actualiza automáticamente `updated_at`

**Diagrama**:
```
Usuario → Editar campos → Validación → UPDATE propiedad → Trigger updated_at
```

## Integraciones con Otros Módulos

### Conexión con Módulo de Contratos

**Tipo**: Bidireccional (relación 1:N + referencia 1:1)

**Descripción**:
- Una propiedad puede tener múltiples contratos a lo largo del tiempo (histórico)
- La propiedad mantiene referencia directa al contrato actual vigente
- Al crear/terminar contrato, se actualiza `contrato_actual_id`

**Ejemplo**:

```tsx
// Obtener propiedad con contrato actual
const { data: propiedad } = await supabase
  .from('propiedades')
  .select(`
    *,
    contrato_actual:contratos!contrato_actual_id(*)
  `)
  .eq('propiedad_id', propiedadId)
  .single()

// Obtener histórico completo de contratos
const { data: contratos } = await supabase
  .from('contratos')
  .select('*')
  .eq('propiedad_id', propiedadId)
  .order('fecha_inicio', { ascending: false })
```

### Conexión con Módulo de Bitácora

**Tipo**: Provee contexto (1:N)

**Descripción**:
- Cada propiedad tiene su propia bitácora de eventos
- Registro de mantenimientos, incidentes, visitas, documentos, etc.
- Cargos/reembolsos de la bitácora se incluyen en vouchers

**Ejemplo**:

```tsx
// Registrar evento en bitácora
await supabase.from('bitacora_propiedades').insert({
  propiedad_id: propiedadId,
  categoria: 'MANTENIMIENTO',
  titulo: 'Reparación de calefont',
  descripcion: 'Se reemplazó calefont por falla técnica',
  monto_cargo: 150000, // CLP
  autor_id: userId
})
```

### Conexión con Módulo de Servicios Básicos

**Tipo**: Provee contexto (1:N)

**Descripción**:
- Cada propiedad puede tener múltiples servicios configurados (agua, luz, gas)
- Sistema consulta deudas automáticamente vía browser-bot
- Deudas se pueden incluir en vouchers de arriendo

**Ejemplo**:

```tsx
// Configurar servicio para propiedad
await supabase.from('servicios').insert({
  propiedad_id: propiedadId,
  empresa_id: empresaId,
  numero_cliente: '123456789',
  tipo_servicio: 'agua',
  incluir_en_voucher: true
})
```

### Conexión con Módulo de Propietarios

**Tipo**: Consume datos (N:1)

**Descripción**:
- Cada propiedad tiene un propietario asignado
- Se obtienen datos del propietario para generación de contratos y liquidaciones
- Relación many-to-one (un propietario puede tener múltiples propiedades)

**Ejemplo**:

```tsx
// Obtener propiedad con datos del propietario
const { data: propiedad } = await supabase
  .from('propiedades')
  .select(`
    *,
    propietario:propietarios(*)
  `)
  .eq('propiedad_id', propiedadId)
  .single()
```

## Tablas de Supabase Utilizadas

**Propias del módulo**:
- `propiedades`: Datos completos de las propiedades

**Consumidas de otros módulos**:
- `orgs`: Multi-tenancy
- `propietarios`: Dueños de las propiedades
- `contratos`: Contratos asociados (bidireccional)
- `user_org`: Relación usuarios-organizaciones (para RLS)

**Provee datos a**:
- `contratos`: Cada contrato pertenece a una propiedad
- `bitacora_propiedades`: Eventos por propiedad
- `servicios`: Servicios básicos por propiedad
- `vouchers`: Indirectamente vía contratos

## Tipos TypeScript

### Tipos Principales

```typescript
// Generados automáticamente desde Supabase
import { Database } from '@/lib/types/database.types'

type Propiedad = Database['public']['Tables']['propiedades']['Row']
type PropiedadInsert = Database['public']['Tables']['propiedades']['Insert']
type PropiedadUpdate = Database['public']['Tables']['propiedades']['Update']

// Tipo para características JSONB
interface CaracteristicasPropiedad {
  piscina?: boolean
  vista_mar?: boolean
  quincho?: boolean
  gym?: boolean
  seguridad_24h?: boolean
  calefaccion_central?: boolean
  aire_acondicionado?: boolean
  ascensor?: boolean
  permite_mascotas?: boolean
  lavanderia?: boolean
  jardin?: boolean
  terraza_comun?: boolean
  [key: string]: boolean | undefined // Permite extensibilidad
}

// Tipos custom del módulo
type PropiedadWithPropietario = Propiedad & {
  propietario: Propietario
}

type PropiedadWithContrato = Propiedad & {
  contrato_actual: Contrato | null
  propietario: Propietario
}

type PropiedadWithFullDetails = PropiedadWithContrato & {
  contratos_historico: Contrato[]
  bitacora_eventos: BitacoraEvento[]
}

interface CreatePropiedadData {
  // Identificadores
  organizacion_id: string
  propietario_id: number

  // Ubicación
  region: string
  comuna: string
  calle: string
  numero: string
  bloque?: string

  // Tipo
  tipo_propiedad: 'casa' | 'departamento' | 'oficina' | 'local_comercial' | 'bodega' | 'estacionamiento'
  naturaleza_propiedad?: 'urbana' | 'rural'
  rol?: string
  destino_arriendo?: 'habitacional' | 'comercial' | 'mixto'

  // Características
  dormitorios: number
  banos: number
  estacionamientos: number
  bodegas: number

  // Superficies
  superficie_util: number
  superficie_terraza?: number
  superficie_total: number

  // Detalles
  estacionamiento_numeros?: string[]
  bodega_numeros?: string[]
  amoblado: boolean

  // Características variables
  caracteristicas?: CaracteristicasPropiedad
}

interface UpdatePropiedadData extends Partial<CreatePropiedadData> {}
```

## Validaciones (Zod)

```typescript
import { z } from 'zod'

const propiedadSchema = z.object({
  // Identificadores
  organizacion_id: z.string().uuid(),
  propietario_id: z.number().int().positive(),

  // Ubicación
  region: z.string().min(1, 'Región es requerida'),
  comuna: z.string().min(1, 'Comuna es requerida'),
  calle: z.string().min(1, 'Calle es requerida'),
  numero: z.string().min(1, 'Número es requerido'),
  bloque: z.string().optional(),

  // Tipo
  tipo_propiedad: z.enum([
    'casa',
    'departamento',
    'oficina',
    'local_comercial',
    'bodega',
    'estacionamiento'
  ]),
  naturaleza_propiedad: z.enum(['urbana', 'rural']).optional(),
  rol: z.string().optional(),
  destino_arriendo: z.enum(['habitacional', 'comercial', 'mixto']).optional(),

  // Características
  dormitorios: z.number().int().min(0),
  banos: z.number().int().min(0),
  estacionamientos: z.number().int().min(0),
  bodegas: z.number().int().min(0),

  // Superficies
  superficie_util: z.number().positive('Superficie útil debe ser positiva'),
  superficie_terraza: z.number().nonnegative().optional(),
  superficie_total: z.number().positive('Superficie total debe ser positiva'),

  // Detalles
  estacionamiento_numeros: z.array(z.string()).optional(),
  bodega_numeros: z.array(z.string()).optional(),
  amoblado: z.boolean(),

  // Características
  caracteristicas: z.record(z.boolean()).optional()
})
.refine(data => data.superficie_total >= data.superficie_util, {
  message: 'Superficie total debe ser mayor o igual a superficie útil',
  path: ['superficie_total']
})
```

## Consideraciones Importantes

### Seguridad

- **RLS habilitado**: Todas las políticas filtran por `organizacion_id` vía `user_org`
- **Validación de permisos**: Solo usuarios de la organización pueden ver/editar sus propiedades
- **Constraints**: Validaciones en BD previenen datos inválidos (superficies negativas, etc.)
- **Cascadas**: `ON DELETE CASCADE` en FK a `orgs` para limpieza automática

### Performance

- **Índices optimizados**:
  - `idx_propiedades_organizacion` → Filtrado por organización (RLS)
  - `idx_propiedades_propietario` → Queries de propiedades por propietario
  - `idx_propiedades_tipo` → Filtrado por tipo de propiedad
  - `idx_propiedades_comuna` → Búsquedas por ubicación
  - `idx_propiedades_contrato_actual` → Acceso rápido a propiedades arrendadas/disponibles
  - `idx_propiedades_caracteristicas` (GIN) → Búsquedas en JSONB

- **Queries eficientes**:
  - Usar `contrato_actual_id IS NULL` para propiedades disponibles
  - Usar `contrato_actual_id IS NOT NULL` para propiedades arrendadas
  - Aprovechar índice GIN para búsquedas JSONB

### Integridad de Datos

- **Validaciones CHECK**: Superficies no pueden ser negativas
- **NOT NULL apropiados**: Campos esenciales son obligatorios
- **FK con CASCADE**: Limpieza automática al eliminar organización
- **FK con SET NULL**: Al eliminar contrato, se limpia referencia (no se elimina propiedad)
- **Trigger updated_at**: Actualización automática de timestamp

### Diseño de Datos

- **Una sola tabla**: No separar en `propiedad_detalles` (relación 1:1 ineficiente)
- **JSONB para características variables**: Flexibilidad sin agregar columnas infinitas
- **text[] para arrays simples**: Más eficiente que JSONB para listas de strings
- **numeric(10,2) para superficies**: Precisión decimal sin errores de redondeo

## Pendientes / TODOs

- [ ] Implementar UI para gestión de propiedades (CRUD completo)
- [ ] Agregar galería de fotos (tabla `fotos_propiedades`)
- [ ] Implementar documentos adjuntos (tabla `documentos_propiedades`)
- [ ] Agregar búsqueda avanzada con filtros múltiples
- [ ] Implementar mapa interactivo de ubicación (Google Maps / Mapbox)
- [ ] Portal para que propietarios vean sus propiedades
- [ ] Exportación de datos de propiedades (Excel, PDF)
- [ ] Importación masiva desde CSV/Excel
- [ ] Historial de cambios en propiedades (auditoría completa)

## Decisiones de Diseño Clave

### ¿Por qué una sola tabla en vez de separar `propiedad_detalles`?

**Razón**: Relación 1:1 no justifica separación.

- Siempre se necesitan todos los datos juntos al mostrar una propiedad
- Separar requeriría JOIN constante → más lento
- Relación 1:1 es señal de sobre-normalización
- Mantener una tabla es más simple y eficiente

**Alternativa rechazada**: Dos tablas → más complejidad sin beneficio

### ¿Por qué JSONB para características en vez de columnas?

**Razón**: Flexibilidad sin explosión de columnas.

- Características varían mucho según tipo de propiedad
- Agregar nueva característica no requiere migración de BD
- Índice GIN permite búsquedas eficientes
- Solo características variables van a JSONB, no las principales

**Alternativa rechazada**: Columna por característica → tabla demasiado ancha

### ¿Por qué text[] en vez de JSONB para números de estacionamiento?

**Razón**: Arrays nativos de PostgreSQL son más eficientes para listas simples.

- Solo lista de strings, no necesita estructura compleja
- Queries más simples: `'E-12' = ANY(estacionamiento_numeros)`
- Menor overhead que JSONB
- Tipo nativo de PostgreSQL

### ¿Por qué limitar superficies a numeric(10,2)?

**Razón**: Precisión decimal exacta.

- Evita errores de redondeo de `float`/`double`
- 10 dígitos soportan propiedades de hasta 99.999.999,99 m² (más que suficiente)
- 2 decimales permiten precisión de centímetros cuadrados

### ¿Por qué mantener `contrato_actual_id` si ya hay `contratos.propiedad_id`?

**Razón**: Performance y conveniencia.

- Acceso directo al contrato vigente sin filtrar por estado
- Query `WHERE contrato_actual_id IS NULL` es muy rápida (índice)
- Evita JOIN para saber si propiedad está arrendada
- Patrón común de "cached relationship"

**Trade-off**: Requiere mantener consistencia al crear/terminar contratos

## Ejemplos de Uso Completo

### Ejemplo 1: Crear Propiedad Completa

```tsx
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

export function CreatePropiedadForm() {
  const queryClient = useQueryClient()

  const form = useForm<CreatePropiedadData>({
    resolver: zodResolver(propiedadSchema),
    defaultValues: {
      dormitorios: 0,
      banos: 0,
      estacionamientos: 0,
      bodegas: 0,
      amoblado: false,
      caracteristicas: {}
    }
  })

  const createMutation = useMutation({
    mutationFn: async (data: CreatePropiedadData) => {
      const { data: propiedad, error } = await supabase
        .from('propiedades')
        .insert({
          organizacion_id: currentOrgId,
          propietario_id: data.propietario_id,
          region: data.region,
          comuna: data.comuna,
          calle: data.calle,
          numero: data.numero,
          bloque: data.bloque,
          tipo_propiedad: data.tipo_propiedad,
          naturaleza_propiedad: data.naturaleza_propiedad,
          rol: data.rol,
          destino_arriendo: data.destino_arriendo,
          dormitorios: data.dormitorios,
          banos: data.banos,
          estacionamientos: data.estacionamientos,
          bodegas: data.bodegas,
          superficie_util: data.superficie_util,
          superficie_terraza: data.superficie_terraza,
          superficie_total: data.superficie_total,
          estacionamiento_numeros: data.estacionamiento_numeros,
          bodega_numeros: data.bodega_numeros,
          amoblado: data.amoblado,
          caracteristicas: data.caracteristicas
        })
        .select()
        .single()

      if (error) throw error
      return propiedad
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propiedades'] })
      toast.success('Propiedad creada exitosamente')
    },
    onError: (error) => {
      toast.error('Error al crear propiedad')
      console.error(error)
    }
  })

  return (
    <Form {...form}>
      {/* Formulario completo con todos los campos */}
    </Form>
  )
}
```

### Ejemplo 2: Listar Propiedades con Filtros

```tsx
'use client'

export function usePropiedades(orgId: string, filters?: {
  tipo?: string
  comuna?: string
  disponible?: boolean
}) {
  return useQuery({
    queryKey: ['propiedades', orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from('propiedades')
        .select(`
          *,
          propietario:propietarios(*),
          contrato_actual:contratos!contrato_actual_id(*)
        `)
        .eq('organizacion_id', orgId)

      // Filtros opcionales
      if (filters?.tipo) {
        query = query.eq('tipo_propiedad', filters.tipo)
      }

      if (filters?.comuna) {
        query = query.eq('comuna', filters.comuna)
      }

      if (filters?.disponible !== undefined) {
        if (filters.disponible) {
          query = query.is('contrato_actual_id', null)
        } else {
          query = query.not('contrato_actual_id', 'is', null)
        }
      }

      const { data, error } = await query

      if (error) throw error
      return data as PropiedadWithContrato[]
    }
  })
}

// Uso en componente
export function PropiedadesList() {
  const { data: propiedades, isLoading } = usePropiedades(currentOrgId, {
    disponible: true,
    tipo: 'departamento'
  })

  if (isLoading) return <Skeleton />

  return (
    <div>
      {propiedades?.map(propiedad => (
        <PropiedadCard key={propiedad.propiedad_id} propiedad={propiedad} />
      ))}
    </div>
  )
}
```

### Ejemplo 3: Búsqueda por Características JSONB

```tsx
'use client'

export function PropiedadesConPiscina({ orgId }: { orgId: string }) {
  const { data } = useQuery({
    queryKey: ['propiedades', orgId, 'con-piscina'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select('*')
        .eq('organizacion_id', orgId)
        .eq('caracteristicas->>piscina', 'true') // Búsqueda JSONB

      if (error) throw error
      return data
    }
  })

  return <List propiedades={data} />
}

// Búsqueda múltiple
export function PropiedadesLujo({ orgId }: { orgId: string }) {
  const { data } = useQuery({
    queryKey: ['propiedades', orgId, 'lujo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select('*')
        .eq('organizacion_id', orgId)
        .contains('caracteristicas', {
          piscina: true,
          gym: true,
          seguridad_24h: true
        }) // Operador @> de PostgreSQL

      if (error) throw error
      return data
    }
  })

  return <List propiedades={data} />
}
```

### Ejemplo 4: Actualizar Propiedad

```tsx
'use client'

export function UpdatePropiedadForm({ propiedadId }: { propiedadId: string }) {
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: async (data: UpdatePropiedadData) => {
      const { data: updated, error } = await supabase
        .from('propiedades')
        .update(data)
        .eq('propiedad_id', propiedadId)
        .select()
        .single()

      if (error) throw error
      return updated
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propiedades'] })
      queryClient.invalidateQueries({ queryKey: ['propiedades', propiedadId] })
      toast.success('Propiedad actualizada')
    }
  })

  return <Form onSubmit={updateMutation.mutate} />
}
```

## Changelog

### 2025-12-22 - v1.0 (Implementación inicial)

- **Implementado**: Tabla `propiedades` completa en Supabase
- **Implementado**: Relación bidireccional con `contratos`
- **Implementado**: JSONB para características variables
- **Implementado**: text[] para arrays de números de estacionamiento/bodega
- **Implementado**: Trigger automático para `updated_at`
- **Implementado**: RLS completo por organización
- **Implementado**: Índices optimizados (organizacion, propietario, tipo, comuna, contrato_actual)
- **Implementado**: Índice GIN para búsquedas JSONB
- **Implementado**: Validaciones CHECK para superficies
- **Creado**: Documentación completa del módulo

---

**Última actualización**: 2025-12-22
**Estado**: ✅ Tabla implementada en BD | ⏳ UI y lógica de negocio pendientes
**Mantenido por**: Sistema Real State Pro
