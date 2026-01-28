# Migraciones - Módulo de Propiedades

> Documentación técnica del schema de base de datos para el módulo de Propiedades

## Resumen

Este módulo gestiona las propiedades inmobiliarias del sistema. Utiliza una única tabla principal con todos los datos (relación 1:1), JSONB para características variables, y relación bidireccional con contratos.

## Tabla: `propiedades`

### Schema Completo

```sql
CREATE TABLE public.propiedades (
  -- Identificadores
  propiedad_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL,
  propietario_id bigint NOT NULL,
  contrato_actual_id uuid NULL,

  -- Ubicación
  region text NOT NULL,
  comuna text NOT NULL,
  calle text NOT NULL,
  numero text NOT NULL,
  bloque text NULL,

  -- Tipo y naturaleza
  tipo_propiedad text NOT NULL,
  naturaleza_propiedad text NULL,
  rol text NULL,
  destino_arriendo text NULL,

  -- Características principales
  dormitorios integer NOT NULL DEFAULT 0,
  banos integer NOT NULL DEFAULT 0,
  estacionamientos integer NOT NULL DEFAULT 0,
  bodegas integer NOT NULL DEFAULT 0,

  -- Superficies (en m²)
  superficie_util numeric(10, 2) NOT NULL DEFAULT 0,
  superficie_terraza numeric(10, 2) NULL DEFAULT 0,
  superficie_total numeric(10, 2) NOT NULL DEFAULT 0,

  -- Detalles de estacionamientos y bodegas
  estacionamiento_numeros text[] NULL,
  bodega_numeros text[] NULL,

  -- Estado de amoblado
  amoblado boolean NOT NULL DEFAULT false,

  -- Características adicionales variables (JSONB)
  caracteristicas jsonb NULL DEFAULT '{}'::jsonb,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Foreign Keys
  CONSTRAINT propiedades_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES orgs(org_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT propiedades_propietario_id_fkey
    FOREIGN KEY (propietario_id) REFERENCES propietarios(propietario_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT propiedades_contrato_actual_id_fkey
    FOREIGN KEY (contrato_actual_id) REFERENCES contratos(contrato_id)
    ON UPDATE SET NULL ON DELETE SET NULL,

  -- Validaciones
  CONSTRAINT superficie_util_positiva CHECK (superficie_util >= 0),
  CONSTRAINT superficie_total_positiva CHECK (superficie_total >= 0),
  CONSTRAINT dormitorios_no_negativos CHECK (dormitorios >= 0),
  CONSTRAINT banos_no_negativos CHECK (banos >= 0)
);
```

### Índices

```sql
-- Índice por organización (para RLS y queries frecuentes)
CREATE INDEX idx_propiedades_organizacion ON propiedades(organizacion_id);

-- Índice por propietario
CREATE INDEX idx_propiedades_propietario ON propiedades(propietario_id);

-- Índice por contrato actual (propiedades disponibles/arrendadas)
CREATE INDEX idx_propiedades_contrato_actual ON propiedades(contrato_actual_id);

-- Índice por tipo de propiedad
CREATE INDEX idx_propiedades_tipo ON propiedades(tipo_propiedad);

-- Índice por comuna (búsquedas geográficas)
CREATE INDEX idx_propiedades_comuna ON propiedades(comuna);

-- Índice GIN para búsquedas en JSONB
CREATE INDEX idx_propiedades_caracteristicas ON propiedades USING GIN (caracteristicas);
```

**Justificación de índices**:
- `organizacion_id`: Usad en TODAS las queries (RLS)
- `propietario_id`: Listar propiedades por propietario
- `contrato_actual_id`: Filtrar propiedades disponibles (`IS NULL`) o arrendadas (`IS NOT NULL`)
- `tipo_propiedad`: Filtros comunes en UI
- `comuna`: Búsquedas por ubicación
- `caracteristicas` (GIN): Búsquedas en JSONB (`@>`, `->>`)

### Triggers

```sql
-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger en propiedades
CREATE TRIGGER update_propiedades_updated_at
  BEFORE UPDATE ON propiedades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Justificación**:
- Actualiza `updated_at` automáticamente en cada UPDATE
- Evita errores manuales al olvidar actualizar el campo
- Útil para auditoría y ordenamiento por última modificación

### Row Level Security (RLS)

```sql
-- Habilitar RLS
ALTER TABLE propiedades ENABLE ROW LEVEL SECURITY;

-- Política: Solo ver propiedades de tu organización
CREATE POLICY propiedades_org_isolation ON propiedades
  USING (organizacion_id IN (
    SELECT org_id FROM user_org WHERE user_id = auth.uid()
  ));
```

**Justificación**:
- Aislamiento multi-tenant automático
- Usuario solo ve propiedades de sus organizaciones
- Aplica en SELECT, INSERT, UPDATE, DELETE
- No se puede acceder a datos de otras organizaciones

### Campos Detallados

| Campo | Tipo | Nullable | Default | Descripción |
|-------|------|----------|---------|-------------|
| **propiedad_id** | uuid | NO | gen_random_uuid() | Identificador único de la propiedad |
| **organizacion_id** | uuid | NO | - | FK a `orgs` (multi-tenant) |
| **propietario_id** | bigint | NO | - | FK a `propietarios` |
| **contrato_actual_id** | uuid | SI | NULL | FK a `contratos` (contrato vigente) |
| **region** | text | NO | - | Región de Chile (ej: "Metropolitana") |
| **comuna** | text | NO | - | Comuna (ej: "Las Condes") |
| **calle** | text | NO | - | Nombre de la calle |
| **numero** | text | NO | - | Número de propiedad (puede incluir letras) |
| **bloque** | text | SI | NULL | Bloque/Torre/Depto (ej: "Torre A, Depto 501") |
| **tipo_propiedad** | text | NO | - | Tipo: casa, departamento, oficina, local_comercial, bodega, estacionamiento |
| **naturaleza_propiedad** | text | SI | NULL | Naturaleza: urbana, rural |
| **rol** | text | SI | NULL | Rol de avalúo fiscal |
| **destino_arriendo** | text | SI | NULL | Destino: habitacional, comercial, mixto |
| **dormitorios** | integer | NO | 0 | Número de dormitorios |
| **banos** | integer | NO | 0 | Número de baños |
| **estacionamientos** | integer | NO | 0 | Número de estacionamientos |
| **bodegas** | integer | NO | 0 | Número de bodegas |
| **superficie_util** | numeric(10,2) | NO | 0 | Superficie útil en m² |
| **superficie_terraza** | numeric(10,2) | SI | 0 | Superficie de terraza en m² |
| **superficie_total** | numeric(10,2) | NO | 0 | Superficie total en m² |
| **estacionamiento_numeros** | text[] | SI | NULL | Array de números (ej: ['E-12', 'E-13']) |
| **bodega_numeros** | text[] | SI | NULL | Array de números (ej: ['B-5']) |
| **amoblado** | boolean | NO | false | Si la propiedad está amoblada |
| **caracteristicas** | jsonb | SI | '{}' | Características variables (piscina, gym, etc.) |
| **created_at** | timestamptz | NO | now() | Fecha de creación |
| **updated_at** | timestamptz | NO | now() | Fecha de última actualización (trigger) |

### Relaciones (Foreign Keys)

#### 1. `propiedades.organizacion_id → orgs.org_id`

```sql
CONSTRAINT propiedades_organizacion_id_fkey
  FOREIGN KEY (organizacion_id) REFERENCES orgs(org_id)
  ON UPDATE CASCADE ON DELETE CASCADE
```

**Comportamiento**:
- `ON UPDATE CASCADE`: Si cambia el `org_id` en `orgs`, actualiza automáticamente en `propiedades`
- `ON DELETE CASCADE`: Si se elimina la organización, se eliminan todas sus propiedades

**Justificación**: Multi-tenancy estricto. Si se elimina org, deben eliminarse sus datos.

#### 2. `propiedades.propietario_id → propietarios.propietario_id`

```sql
CONSTRAINT propiedades_propietario_id_fkey
  FOREIGN KEY (propietario_id) REFERENCES propietarios(propietario_id)
  ON UPDATE CASCADE ON DELETE CASCADE
```

**Comportamiento**:
- `ON UPDATE CASCADE`: Si cambia el `propietario_id`, actualiza en `propiedades`
- `ON DELETE CASCADE`: Si se elimina el propietario, se eliminan sus propiedades

**Justificación**: Propiedad sin propietario no tiene sentido en el sistema.

#### 3. `propiedades.contrato_actual_id → contratos.contrato_id`

```sql
CONSTRAINT propiedades_contrato_actual_id_fkey
  FOREIGN KEY (contrato_actual_id) REFERENCES contratos(contrato_id)
  ON UPDATE SET NULL ON DELETE SET NULL
```

**Comportamiento**:
- `ON UPDATE SET NULL`: Si cambia el `contrato_id`, limpia la referencia
- `ON DELETE SET NULL`: Si se elimina el contrato, limpia la referencia (propiedad queda disponible)

**Justificación**: Propiedad puede existir sin contrato actual (disponible). No eliminar propiedad al terminar contrato.

### Validaciones (Constraints)

```sql
-- Superficies no pueden ser negativas
CONSTRAINT superficie_util_positiva CHECK (superficie_util >= 0)
CONSTRAINT superficie_total_positiva CHECK (superficie_total >= 0)

-- Cantidades no pueden ser negativas
CONSTRAINT dormitorios_no_negativos CHECK (dormitorios >= 0)
CONSTRAINT banos_no_negativos CHECK (banos >= 0)
```

**Justificación**:
- Previene datos inconsistentes a nivel de BD
- Complementa validaciones del frontend
- Última línea de defensa contra errores

## Migración Inicial

### Migración: `create_propiedades_table`

**Fecha**: 2025-12-22

**Descripción**: Creación de tabla `propiedades` con estructura completa

```sql
-- Crear tabla propiedades (sin FK a contratos inicialmente)
CREATE TABLE public.propiedades (
  -- Identificadores
  propiedad_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id uuid NOT NULL,
  propietario_id bigint NOT NULL,
  contrato_actual_id uuid NULL,

  -- Ubicación
  region text NOT NULL,
  comuna text NOT NULL,
  calle text NOT NULL,
  numero text NOT NULL,
  bloque text NULL,

  -- Tipo y naturaleza
  tipo_propiedad text NOT NULL,
  naturaleza_propiedad text NULL,
  rol text NULL,
  destino_arriendo text NULL,

  -- Características principales
  dormitorios integer NOT NULL DEFAULT 0,
  banos integer NOT NULL DEFAULT 0,
  estacionamientos integer NOT NULL DEFAULT 0,
  bodegas integer NOT NULL DEFAULT 0,

  -- Superficies (en m²)
  superficie_util numeric(10, 2) NOT NULL DEFAULT 0,
  superficie_terraza numeric(10, 2) NULL DEFAULT 0,
  superficie_total numeric(10, 2) NOT NULL DEFAULT 0,

  -- Detalles de estacionamientos y bodegas
  estacionamiento_numeros text[] NULL,
  bodega_numeros text[] NULL,

  -- Estado de amoblado
  amoblado boolean NOT NULL DEFAULT false,

  -- Características adicionales variables (JSONB)
  caracteristicas jsonb NULL DEFAULT '{}'::jsonb,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Foreign Keys (contratos se agregará después)
  CONSTRAINT propiedades_organizacion_id_fkey
    FOREIGN KEY (organizacion_id) REFERENCES orgs(org_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT propiedades_propietario_id_fkey
    FOREIGN KEY (propietario_id) REFERENCES propietarios(propiedad_id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  -- Validaciones
  CONSTRAINT superficie_util_positiva CHECK (superficie_util >= 0),
  CONSTRAINT superficie_total_positiva CHECK (superficie_total >= 0),
  CONSTRAINT dormitorios_no_negativos CHECK (dormitorios >= 0),
  CONSTRAINT banos_no_negativos CHECK (banos >= 0)
);

-- Índices para performance
CREATE INDEX idx_propiedades_organizacion ON propiedades(organizacion_id);
CREATE INDEX idx_propiedades_propietario ON propiedades(propietario_id);
CREATE INDEX idx_propiedades_contrato_actual ON propiedades(contrato_actual_id);
CREATE INDEX idx_propiedades_tipo ON propiedades(tipo_propiedad);
CREATE INDEX idx_propiedades_comuna ON propiedades(comuna);

-- Índice GIN para búsquedas en JSONB
CREATE INDEX idx_propiedades_caracteristicas ON propiedades USING GIN (caracteristicas);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_propiedades_updated_at
  BEFORE UPDATE ON propiedades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS
ALTER TABLE propiedades ENABLE ROW LEVEL SECURITY;

-- Política RLS por organización
CREATE POLICY propiedades_org_isolation ON propiedades
  USING (organizacion_id IN (
    SELECT org_id FROM user_org WHERE user_id = auth.uid()
  ));
```

### Migración: `add_propiedades_contrato_fk`

**Fecha**: 2025-12-22

**Descripción**: Agregar FK a tabla `contratos` (creada posteriormente)

```sql
-- Agregar foreign key de propiedades.contrato_actual_id → contratos.contrato_id
ALTER TABLE propiedades
ADD CONSTRAINT propiedades_contrato_actual_id_fkey
  FOREIGN KEY (contrato_actual_id)
  REFERENCES contratos(contrato_id)
  ON UPDATE SET NULL
  ON DELETE SET NULL;
```

**Justificación**: La tabla `contratos` fue creada después de `propiedades`, por lo que la FK se agregó en migración separada.

## Queries Comunes

### Listar todas las propiedades de una organización

```sql
SELECT * FROM propiedades
WHERE organizacion_id = 'uuid-de-org'
ORDER BY created_at DESC;
```

### Propiedades disponibles (sin contrato)

```sql
SELECT * FROM propiedades
WHERE organizacion_id = 'uuid-de-org'
  AND contrato_actual_id IS NULL
ORDER BY created_at DESC;
```

### Propiedades arrendadas (con contrato vigente)

```sql
SELECT * FROM propiedades
WHERE organizacion_id = 'uuid-de-org'
  AND contrato_actual_id IS NOT NULL
ORDER BY created_at DESC;
```

### Propiedades con características específicas

```sql
-- Propiedades con piscina
SELECT * FROM propiedades
WHERE organizacion_id = 'uuid-de-org'
  AND caracteristicas->>'piscina' = 'true';

-- Propiedades con piscina Y gym
SELECT * FROM propiedades
WHERE organizacion_id = 'uuid-de-org'
  AND caracteristicas @> '{"piscina": true, "gym": true}'::jsonb;
```

### Propiedad con todos sus datos relacionados

```sql
SELECT
  p.*,
  prop.nombre_primero || ' ' || prop.apellido_primero AS propietario_nombre,
  c.estado AS contrato_estado,
  c.fecha_inicio AS contrato_inicio
FROM propiedades p
LEFT JOIN propietarios prop ON p.propietario_id = prop.propietario_id
LEFT JOIN contratos c ON p.contrato_actual_id = c.contrato_id
WHERE p.propiedad_id = 'uuid-de-propiedad';
```

### Búsqueda por ubicación

```sql
SELECT * FROM propiedades
WHERE organizacion_id = 'uuid-de-org'
  AND comuna = 'Las Condes'
  AND tipo_propiedad = 'departamento'
ORDER BY superficie_util DESC;
```

### Propiedades por propietario

```sql
SELECT * FROM propiedades
WHERE propietario_id = 123
ORDER BY created_at DESC;
```

## Mantenimiento

### Actualizar tipos TypeScript

Cuando se modifique el schema, regenerar tipos:

```bash
pnpm types:update
```

Esto ejecuta:
```bash
supabase gen types typescript --project-id <id> > lib/types/database.types.ts
```

### Agregar nueva característica al JSONB

No requiere migración, solo actualizar en la aplicación:

```tsx
// Ejemplo: agregar "jacuzzi"
await supabase
  .from('propiedades')
  .update({
    caracteristicas: {
      ...propiedad.caracteristicas,
      jacuzzi: true
    }
  })
  .eq('propiedad_id', propiedadId)
```

### Reindexar JSONB (si performance degrada)

```sql
REINDEX INDEX idx_propiedades_caracteristicas;
```

### Vacuum periódico

```sql
VACUUM ANALYZE propiedades;
```

## Consideraciones de Performance

### Estimación de tamaño

Asumiendo:
- Promedio de 500 propiedades por organización
- 50 organizaciones
- Total: 25,000 propiedades

**Tamaño estimado por fila**: ~2 KB (con JSONB moderado)
**Tamaño total**: ~50 MB

**Índices**: ~30 MB adicionales

**Total estimado**: ~80 MB (muy manejable)

### Queries lentas a evitar

❌ **Evitar**:
```sql
-- Full table scan sin índice
SELECT * FROM propiedades WHERE descripcion LIKE '%piscina%';

-- JSONB sin índice GIN
SELECT * FROM propiedades WHERE caracteristicas::text LIKE '%piscina%';
```

✅ **Preferir**:
```sql
-- Usar índice en comuna
SELECT * FROM propiedades WHERE comuna = 'Las Condes';

-- Usar índice GIN en JSONB
SELECT * FROM propiedades WHERE caracteristicas->>'piscina' = 'true';
```

### Optimización de JSONB

Para búsquedas frecuentes, considerar crear índice específico:

```sql
-- Índice solo en campo específico de JSONB
CREATE INDEX idx_propiedades_piscina
  ON propiedades ((caracteristicas->>'piscina'));
```

## Rollback

### Rollback de migración `add_propiedades_contrato_fk`

```sql
ALTER TABLE propiedades
DROP CONSTRAINT IF EXISTS propiedades_contrato_actual_id_fkey;
```

### Rollback completo de tabla `propiedades`

⚠️ **PELIGRO**: Esto eliminará TODOS los datos

```sql
-- Eliminar políticas RLS
DROP POLICY IF EXISTS propiedades_org_isolation ON propiedades;

-- Eliminar triggers
DROP TRIGGER IF EXISTS update_propiedades_updated_at ON propiedades;

-- Eliminar índices (se eliminan automáticamente con la tabla, pero por claridad)
DROP INDEX IF EXISTS idx_propiedades_organizacion;
DROP INDEX IF EXISTS idx_propiedades_propietario;
DROP INDEX IF EXISTS idx_propiedades_contrato_actual;
DROP INDEX IF EXISTS idx_propiedades_tipo;
DROP INDEX IF EXISTS idx_propiedades_comuna;
DROP INDEX IF EXISTS idx_propiedades_caracteristicas;

-- Eliminar tabla
DROP TABLE IF EXISTS propiedades CASCADE;

-- Eliminar función de trigger (si no se usa en otras tablas)
DROP FUNCTION IF EXISTS update_updated_at_column();
```

## Troubleshooting

### Error: "duplicate key value violates unique constraint"

**Causa**: Intento de insertar `propiedad_id` duplicado (raro con UUID)

**Solución**: Verificar que se está usando `gen_random_uuid()` o dejar que la BD lo genere

### Error: "foreign key constraint violation"

**Causa**: Intentar insertar con `organizacion_id` o `propietario_id` que no existe

**Solución**: Verificar que la organización y propietario existen antes de insertar

### Error: "new row violates check constraint"

**Causa**: Superficie negativa o validación CHECK fallida

**Solución**: Verificar que `superficie_util`, `superficie_total`, `dormitorios`, `banos` >= 0

### Performance lenta en búsquedas JSONB

**Causa**: No se está usando el índice GIN

**Solución**: Usar operadores compatibles con GIN: `->`, `->>`, `@>`, `?`, `?&`, `?|`

### RLS bloqueando queries

**Causa**: Usuario no está en `user_org` para la organización

**Solución**: Verificar que existe relación en `user_org` entre `auth.uid()` y `org_id`

---

**Última actualización**: 2025-12-22
**Versión del schema**: 1.0
**Mantenido por**: Sistema Real State Pro
