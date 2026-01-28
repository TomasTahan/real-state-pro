# Módulo: Contratos de Arriendo

> **Módulo central del sistema**
> Gestiona contratos de arriendo con IA, manteniendo histórico completo de configuraciones

## Descripción General

El módulo de Contratos es el corazón del sistema de gestión de arriendos. Permite crear y administrar contratos de arriendo utilizando IA para generar documentos personalizados desde plantillas. Mantiene un histórico versionado de todas las configuraciones de cobro, permitiendo trazabilidad completa de cambios en montos, comisiones, multas y garantías a lo largo del tiempo.

Este módulo sirve como fuente de verdad para la generación de vouchers de cobro, cálculo de multas, reajustes por IPC, y distribución de pagos (payouts).

## Ubicación

```
modules/contratos/
  ├── migration.sql          # Schema de base de datos
  └── README.md             # Esta documentación
```

## Responsabilidades

- **Gestión de contratos**: Crear, editar, renovar y finalizar contratos de arriendo
- **Generación con IA**: Utilizar plantillas e IA (OpenRouter) para generar contratos personalizados
- **Versionado de configuraciones**: Mantener histórico completo de cambios en configuración de cobro
- **Calendario de cobros**: Definir cuándo se generan, envían y vencen los vouchers
- **Configuración de multas**: Definir reglas para multas por atraso (legal o personalizado)
- **Reajustes IPC**: Configurar reajustes semestrales o anuales
- **Garantías**: Administrar garantías y avales del contrato
- **Comisiones**: Configurar comisiones de administración
- **Payouts**: Definir cuentas bancarias para distribución de pagos

## Estructura de Base de Datos

### Arquitectura: 2 Tablas Principales + 3 Tablas Auxiliares

El diseño utiliza **2 tablas principales** para separar datos inmutables de configuraciones versionadas, más **3 tablas auxiliares** (2 stub + 1 completa):

#### 1. `contratos` (Tabla principal - Datos inmutables)

Contiene información que NO cambia o cambia muy raramente:

```sql
contratos:
  - contrato_id (PK, UUID)
  - propiedad_id (FK → propiedades)
  - arrendatario_id (FK → arrendatarios)
  - org_id (FK → orgs)
  - estado (VIGENTE, VENCIDO, TERMINADO)

  -- Fechas del contrato
  - fecha_inicio
  - fecha_termino
  - es_indefinido
  - renovacion_automatica
  - aviso_termino_dias

  -- Calendario de cobro
  - dia_generacion (1-28)
  - dia_envio (1-28, nullable)
  - limite_pago (1-28)

  -- Reajuste IPC
  - reajuste_ipc (SEMESTRAL, ANUAL, null)

  - created_at
  - updated_at
```

**Estados del contrato**:

- `VIGENTE`: Contrato activo, genera vouchers automáticamente
- `VENCIDO`: Llegó a `fecha_termino`, pendiente de renovación automática
- `TERMINADO`: Contrato finalizado, no genera más vouchers

**Notas importantes**:

- `dia_generacion` está limitado a 1-28 para evitar problemas con meses de 30/31 días
- `dia_envio = null` significa que se envía el mismo día de generación
- `limite_pago` es el día hasta donde NO se cobran multas por atraso

#### 2. `contratos_config_historico` (Configuraciones versionadas)

Contiene configuraciones que SÍ pueden cambiar, con versionado completo:

```sql
contratos_config_historico:
  - config_id (PK)
  - contrato_id (FK)
  - version (auto-increment)
  - vigente_desde
  - vigente_hasta (NULL = config actual)

  -- Monto arriendo
  - moneda_arriendo (CLP, UF)
  - monto_arriendo
  - metodo_calculo_uf (inicio_mes, dia_generacion)

  -- Comisión
  - tipo_comision (porcentaje, CLP, UF)
  - valor_comision

  -- Multas
  - multas_atraso (boolean)
  - tipo_multa (legal, personalizado)
  - porcentaje_multa
  - maximo_multa
  - dias_gracia_multa

  -- Garantía
  - tipo_garantia (multiplo, UF, CLP, null)
  - monto_garantia
  - garantia_destinatario (dueño, administrador, 50/50)

  -- Payouts
  - cuenta_dueno_id (FK)
  - cuenta_admin_id (FK)

  -- Auditoría
  - created_at
  - created_by (user_id)
```

**Sistema de versionado**:

- `version` se auto-incrementa con cada nuevo registro (trigger)
- `vigente_hasta = NULL` indica la configuración actual
- Al crear nueva versión, se actualiza `vigente_hasta` de la versión anterior

#### 3. `arrendatarios` (Tabla stub - Pendiente completar)

Tabla creada con estructura mínima para resolver dependencias:

```sql
arrendatarios:
  - arrendatario_id (PK, UUID)
  - org_id (FK → orgs)
  - created_at

-- TODO: Agregar campos como nombre, rut, email, telefono, direccion, etc.
```

#### 4. `cuentas_bancarias` (Tabla stub - Pendiente completar)

Tabla creada con estructura mínima para resolver dependencias:

```sql
cuentas_bancarias:
  - cuenta_id (PK, UUID)
  - org_id (FK → orgs)
  - created_at

-- TODO: Agregar campos como banco, tipo_cuenta, numero_cuenta, titular, rut, email, etc.
```

#### 5. `avales` (Tabla completa)

Gestiona los avales del contrato:

```sql
avales:
  - aval_id (PK, UUID)
  - contrato_id (FK → contratos)

  -- Datos del aval
  - nombre
  - rut
  - email
  - telefono
  - direccion

  -- Tipo de aval
  - tipo (personal, solidario, simple)

  - created_at
```

### Relación con Otras Tablas

```
orgs (1) ──< (N) contratos
orgs (1) ──< (N) arrendatarios (stub)
orgs (1) ──< (N) cuentas_bancarias (stub)

propiedades (1) ──< (N) contratos
arrendatarios (1) ──< (N) contratos
users (1) ──< (N) contratos_config_historico (created_by)

contratos (1) ──< (N) contratos_config_historico
contratos (1) ──< (N) avales
contratos (1) ──< (N) vouchers (genera - módulo de pagos)

cuentas_bancarias (1) ──< (N) contratos_config_historico (cuenta_dueno_id)
cuentas_bancarias (1) ──< (N) contratos_config_historico (cuenta_admin_id)
```

## Flujos de Datos

### Flujo 1: Creación de Contrato

1. Usuario inicia creación de contrato (manual o con IA)
2. Si usa IA:
   - Selecciona plantilla
   - Completa datos básicos (propiedad, arrendatario, propietario)
   - IA genera contrato personalizado usando OpenRouter (Gemini 3.0 Flash)
   - IA extrae información estructurada del contrato
3. Sistema crea 2 registros:
   ```sql
   INSERT INTO contratos (fecha_inicio, estado, ...)
   INSERT INTO contratos_config_historico (contrato_id, version=1, vigente_desde=NOW(), ...)
   ```
4. Opcionalmente crea avales en tabla `avales`
5. Actualiza `contrato_actual_id` en tabla `propiedades`

**Diagrama**:

```
Usuario → Formulario/IA → Validación → INSERT contratos → INSERT config v1 → UPDATE propiedad
```

### Flujo 2: Modificar Configuración de Cobro

Ejemplo: Cambiar monto de arriendo de $500.000 a $550.000

1. Usuario edita configuración (solo admin)
2. Sistema valida cambios
3. Marca config actual como histórica:
   ```sql
   UPDATE contratos_config_historico
   SET vigente_hasta = NOW()
   WHERE contrato_id = X AND vigente_hasta IS NULL
   ```
4. Crea nueva versión:
   ```sql
   INSERT INTO contratos_config_historico
   (contrato_id, version=2, vigente_desde=NOW(), monto_arriendo=550000, ...)
   ```
5. Trigger auto-incrementa `version`
6. Próximos vouchers usarán la nueva configuración

**Diagrama**:

```
Usuario → Editar Config → Validar → Cerrar config v1 → Crear config v2 → Próximos vouchers
```

### Flujo 3: Generación de Voucher (Integración con Módulo de Cobranza)

1. Cron job diario revisa contratos con `estado = VIGENTE`
2. Por cada contrato, verifica si debe generar voucher:
   - Compara `dia_generacion` con día actual
   - Verifica que no exista voucher duplicado para el período
3. Obtiene configuración actual:
   ```sql
   SELECT * FROM contratos_config_historico
   WHERE contrato_id = X AND vigente_hasta IS NULL
   ```
4. Obtiene datos del contrato:
   ```sql
   SELECT * FROM contratos WHERE contrato_id = X
   ```
5. Si tiene `reajuste_ipc`, calcula reajuste:
   - Calcula meses desde `fecha_inicio`
   - Si pasó período (semestre/año), consulta vista materializada `ipc_mensual`
   - Aplica factor de reajuste al `monto_arriendo`
6. Crea voucher con:
   - `monto_base` = `monto_arriendo` de la config
   - `monto_reajustado` = `monto_base * factor_ipc` (si aplica)
   - `config_version_usada` = `version` (para trazabilidad)
   - Otros datos de la config (multas, descuentos, etc.)

**Diagrama**:

```
Cron → Contratos VIGENTES → Config actual → Calcular IPC → Crear voucher → Email arrendatario
```

### Flujo 4: Renovación Automática

1. Cron job diario revisa contratos con:
   - `estado = VIGENTE`
   - `renovacion_automatica = true`
   - `fecha_termino <= HOY`
2. Por cada contrato a renovar:
   - Cambia estado del contrato actual a `VENCIDO`
   - Crea **nuevo contrato** (nuevo registro):
     ```sql
     INSERT INTO contratos (
       propiedad_id,
       arrendatario_id,
       fecha_inicio = fecha_termino_anterior + 1 día,
       fecha_termino = fecha_inicio + mismo_plazo,
       ...
     )
     ```
   - Copia configuración actual al nuevo contrato:
     ```sql
     INSERT INTO contratos_config_historico (
       contrato_id = nuevo_contrato_id,
       version = 1,
       -- copia todos los campos de la config actual del contrato anterior
     )
     ```
3. Actualiza `contrato_actual_id` en `propiedades`
4. Notifica a admin y propietario (futuro)

**Diagrama**:

```
Cron → Contratos a renovar → Estado VENCIDO → Nuevo contrato → Copiar config → Notificar
```

### Flujo 5: Cálculo de Reajuste IPC

**Importante**: El reajuste IPC NO se guarda en la tabla de contratos, se calcula **on-demand** al generar voucher.

1. Al generar voucher, sistema verifica si contrato tiene `reajuste_ipc`
2. Si tiene:
   - Calcula meses transcurridos desde `fecha_inicio` del contrato
   - Determina si debe aplicar reajuste:
     - `SEMESTRAL`: cada 6 meses
     - `ANUAL`: cada 12 meses
   - Consulta vista materializada `ipc_mensual` (actualizada el 1 de cada mes con cron)
   - Calcula factor de reajuste acumulado
   - Aplica al `monto_arriendo` de la config actual
3. Guarda en voucher:
   - `monto_base` = monto original sin reajuste
   - `monto_reajustado` = monto con IPC aplicado
   - `factor_ipc_aplicado` = factor usado

**Vista materializada IPC**:

```sql
CREATE MATERIALIZED VIEW ipc_mensual AS
SELECT
  fecha,
  valor_uf,
  variacion_mensual,
  variacion_semestral,
  variacion_anual
FROM ipc_historico
ORDER BY fecha DESC;

-- Actualización automática (cron diario/mensual)
REFRESH MATERIALIZED VIEW ipc_mensual;
```

**Ventajas de este enfoque**:

- No agrega columnas a `contratos`
- No requiere cron adicional para actualizar contratos
- Cache natural via vista materializada
- Histórico exacto en cada voucher

## Integraciones con Otros Módulos

### Conexión con Módulo de Propiedades

**Tipo**: Bidireccional

**Descripción**:

- Propiedades pueden tener múltiples contratos a lo largo del tiempo (histórico)
- Cada propiedad tiene referencia a `contrato_actual_id` (el contrato VIGENTE)
- Al crear/renovar contrato, se actualiza la propiedad

**Ejemplo**:

```tsx
// Al crear contrato
const { data: contrato } = await supabase
  .from('contratos')
  .insert({
    propiedad_id: propiedadId,
    arrendatario_id: arrendatarioId,
    estado: 'VIGENTE',
    ...
  })
  .select()
  .single()

// Actualizar propiedad
await supabase
  .from('propiedades')
  .update({ contrato_actual_id: contrato.contrato_id })
  .eq('propiedad_id', propiedadId)
```

### Conexión con Módulo de Cobranza

**Tipo**: Provee datos

**Descripción**:

- Contratos son la fuente de verdad para generación de vouchers
- Cada voucher almacena `config_version_usada` para trazabilidad
- Cambios en config NO afectan vouchers ya generados

**Ejemplo**:

```tsx
// Generar voucher desde contrato
const { data: config } = await supabase
  .from('contratos_config_historico')
  .select('*')
  .eq('contrato_id', contratoId)
  .is('vigente_hasta', null)
  .single()

const { data: contrato } = await supabase
  .from('contratos')
  .select('*')
  .eq('contrato_id', contratoId)
  .single()

// Crear voucher con configuración actual
await supabase
  .from('vouchers')
  .insert({
    contrato_id: contratoId,
    periodo: calculatePeriod(contrato.dia_generacion),
    monto_base: config.monto_arriendo,
    config_version_usada: config.version,
    ...
  })
```

### Conexión con Módulo de Bitácora

**Tipo**: Consume datos (indirecto)

**Descripción**:

- Eventos de bitácora pueden registrarse por contrato
- Cambios importantes en contrato se registran en bitácora
- Cargos/reembolsos de bitácora se incluyen en vouchers

**Ejemplo**:

```tsx
// Al modificar config de contrato
await supabase.from("bitacora_propiedades").insert({
  propiedad_id: propiedad.propiedad_id,
  categoria: "ADMINISTRATIVO",
  titulo: "Cambio en configuración de contrato",
  descripcion: `Monto de arriendo actualizado de ${oldMonto} a ${newMonto}`,
  autor_id: userId,
});
```

### Conexión con Módulo de Arrendatarios y Propietarios

**Tipo**: Consume datos

**Descripción**:

- Contrato vincula arrendatario con propiedad
- Obtiene datos para generación de contratos y emails
- Relación many-to-one con ambas tablas

## Tablas de Supabase Utilizadas

**Propias del módulo**:
- `contratos`: Datos principales del contrato
- `contratos_config_historico`: Configuraciones versionadas
- `avales`: Avales del contrato (relación 1-N)

**Tablas stub (creadas por el módulo, pendientes completar)**:
- `arrendatarios`: Arrendatarios del contrato (solo ID por ahora)
- `cuentas_bancarias`: Cuentas bancarias para payouts (solo ID por ahora)

**Consumidas de otros módulos**:
- `propiedades`: Vinculación con propiedad
- `propietarios`: Referencia indirecta vía propiedad
- `orgs`: Multi-tenancy
- `user_org`: Relación usuarios-organizaciones (para RLS)
- `users`: Auditoría de cambios
- `vouchers`: Vouchers generados (módulo de pagos)

## Tipos TypeScript

### Tipos Principales

```typescript
// Generados automáticamente desde Supabase
import { Database } from "@/lib/types/database.types";

type Contrato = Database["public"]["Tables"]["contratos"]["Row"];
type ContratoInsert = Database["public"]["Tables"]["contratos"]["Insert"];
type ContratoUpdate = Database["public"]["Tables"]["contratos"]["Update"];

type ConfigHistorico =
  Database["public"]["Tables"]["contratos_config_historico"]["Row"];
type ConfigHistoricoInsert =
  Database["public"]["Tables"]["contratos_config_historico"]["Insert"];

// Tipos custom del módulo
type ContratoWithConfig = Contrato & {
  config_actual: ConfigHistorico;
  arrendatario: Arrendatario;
  propiedad: Propiedad;
};

type ContratoWithFullDetails = ContratoWithConfig & {
  avales: Aval[];
  cuenta_dueno: CuentaBancaria;
  cuenta_admin: CuentaBancaria;
};

interface CreateContratoData {
  // Datos del contrato
  propiedad_id: string;
  arrendatario_id: string;
  fecha_inicio: string;
  fecha_termino?: string;
  es_indefinido: boolean;
  renovacion_automatica: boolean;

  // Calendario
  dia_generacion: number;
  dia_envio?: number;
  limite_pago: number;

  // Config inicial
  moneda_arriendo: "CLP" | "UF";
  monto_arriendo: number;
  tipo_comision?: "porcentaje" | "CLP" | "UF";
  valor_comision?: number;
  // ... resto de campos
}

interface UpdateConfigData {
  // Solo campos editables de config
  monto_arriendo?: number;
  tipo_comision?: "porcentaje" | "CLP" | "UF";
  valor_comision?: number;
  multas_atraso?: boolean;
  // ... resto de campos editables
}

// Tipos para IA
interface PlantillaContrato {
  plantilla_id: string;
  nombre: string;
  contenido: string;
  variables: string[]; // ["{{arrendatario_nombre}}", "{{monto_arriendo}}", ...]
}

interface ContratoGeneradoIA {
  contenido: string; // HTML o Markdown del contrato
  datos_extraidos: CreateContratoData;
}
```

## Validaciones (Zod)

```typescript
import { z } from "zod";

const contratoSchema = z
  .object({
    propiedad_id: z.string().uuid(),
    arrendatario_id: z.string().uuid(),

    fecha_inicio: z.string().date(),
    fecha_termino: z.string().date().optional(),
    es_indefinido: z.boolean(),
    renovacion_automatica: z.boolean(),
    aviso_termino_dias: z.number().int().min(0).max(365).optional(),

    dia_generacion: z.number().int().min(1).max(28),
    dia_envio: z.number().int().min(1).max(28).optional(),
    limite_pago: z.number().int().min(1).max(28),

    reajuste_ipc: z.enum(["SEMESTRAL", "ANUAL"]).optional(),
  })
  .refine((data) => data.es_indefinido || data.fecha_termino, {
    message: "fecha_termino es requerida si no es indefinido",
  });

const configSchema = z
  .object({
    moneda_arriendo: z.enum(["CLP", "UF"]),
    monto_arriendo: z.number().positive(),
    metodo_calculo_uf: z.enum(["inicio_mes", "dia_generacion"]).optional(),

    tipo_comision: z.enum(["porcentaje", "CLP", "UF"]).optional(),
    valor_comision: z.number().nonnegative().optional(),

    multas_atraso: z.boolean(),
    tipo_multa: z.enum(["legal", "personalizado"]).optional(),
    porcentaje_multa: z.number().min(0).max(100).optional(),
    maximo_multa: z.number().nonnegative().optional(),
    dias_gracia_multa: z.number().int().min(0),

    tipo_garantia: z.enum(["multiplo", "UF", "CLP"]).optional(),
    monto_garantia: z.number().positive().optional(),
    garantia_destinatario: z
      .enum(["dueño", "administrador", "50/50"])
      .optional(),

    cuenta_dueno_id: z.string().uuid().optional(),
    cuenta_admin_id: z.string().uuid().optional(),
  })
  .refine((data) => data.moneda_arriendo !== "UF" || data.metodo_calculo_uf, {
    message: "metodo_calculo_uf es requerido cuando moneda es UF",
  })
  .refine(
    (data) => data.tipo_multa !== "personalizado" || data.porcentaje_multa,
    {
      message:
        "porcentaje_multa es requerido cuando tipo_multa es personalizado",
    }
  )
  .refine((data) => !data.tipo_comision || data.valor_comision !== undefined, {
    message: "valor_comision es requerido cuando se define tipo_comision",
  })
  .refine(
    (data) =>
      !data.tipo_garantia ||
      (data.monto_garantia && data.garantia_destinatario),
    {
      message:
        "monto_garantia y garantia_destinatario son requeridos cuando se define tipo_garantia",
    }
  );
```

## Consideraciones Importantes

### Seguridad

- **RLS habilitado**: Todas las políticas filtran por `org_id` vía `user_org`
- **Tablas stub protegidas**: `arrendatarios` y `cuentas_bancarias` también tienen RLS habilitado
- **Auditoría**: Campo `created_by` registra quién hizo cada cambio de configuración
- **Solo admins**: Solo usuarios admin de la organización pueden crear/editar contratos
- **Validación de fechas**: Constraints en BD previenen fechas inválidas

### Performance

- **Índices optimizados**:
  - `idx_contratos_vigentes` para queries de generación de vouchers
  - `idx_config_historico_vigente` para obtener config actual rápidamente
- **Vistas materializadas**: `ipc_mensual` cachea datos de IPC, se actualiza con cron
- **Queries eficientes**: Usar `vigente_hasta IS NULL` para obtener config actual

### Integridad de Datos

- **Versionado automático**: Trigger auto-incrementa `version`, no puede haber errores manuales
- **Constraints**: BD valida coherencia de datos (fechas, montos, tipos)
- **Cascadas**: `ON DELETE CASCADE` en FK para limpieza automática
- **No eliminación de histórico**: Nunca borrar `contratos_config_historico`, solo crear nuevas versiones

### Cálculos Críticos

- **IPC on-demand**: Evita inconsistencias, cada voucher tiene su propio cálculo
- **Multas precisas**: Usar días exactos, considerar `dias_gracia_multa`
- **Montos exactos**: Usar `NUMERIC(12, 2)` para evitar errores de redondeo

## Pendientes / TODOs

- [ ] Implementar generación de contratos con IA (OpenRouter + plantillas)
- [ ] Crear UI para gestión de contratos
- [ ] Implementar renovación automática con cron job
- [ ] Crear API para extracción de datos desde PDF/Word existente
- [ ] Implementar notificaciones de aviso de término
- [ ] Agregar soporte para múltiples tipos de contrato (comercial, bodega, estacionamiento)
- [ ] Crear plantillas predefinidas de contratos
- [ ] Implementar firma electrónica de contratos
- [ ] Portal para que arrendatarios/propietarios vean sus contratos

## Decisiones de Diseño Clave

### ¿Por qué 2 tablas en vez de 1?

**Razón**: Histórico de cambios.

- Sin versionado: Al cambiar monto, se pierde información de vouchers anteriores
- Con versionado: Cada voucher sabe exactamente qué configuración se usó
- Alternativa rechazada: Tabla única → requeriría duplicar filas completas, más complejo

### ¿Por qué IPC on-demand en vez de guardar monto reajustado?

**Razón**: Evitar inconsistencias y crons innecesarios.

- Calcular al generar voucher es más simple y preciso
- Vista materializada cachea datos de IPC (actualizada mensualmente)
- No requiere cron adicional para actualizar contratos
- Histórico exacto en cada voucher

### ¿Por qué límite de dia_generacion a 1-28?

**Razón**: Evitar errores con meses de 30/31 días.

- Si se permite 31, ¿qué pasa en febrero? ¿Se genera el 28 o el 1 de marzo?
- Límite a 28 garantiza que siempre existe el día en todos los meses
- Simplifica lógica de generación de vouchers

### ¿Por qué crear nuevo contrato en renovación automática?

**Razón**: Mejor para histórico y trazabilidad.

- Cada período de arriendo tiene su propio contrato
- Fácil ver cuántas veces se ha renovado (contar contratos)
- Permite diferentes configuraciones por período sin romper histórico
- Alternativa rechazada: Extender `fecha_termino` → pierde histórico de renovaciones

## Ejemplos de Uso Completo

### Ejemplo 1: Crear Contrato Completo

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

export function CreateContratoForm() {
  const queryClient = useQueryClient();

  const form = useForm<CreateContratoData>({
    resolver: zodResolver(contratoSchema.merge(configSchema)),
    defaultValues: {
      es_indefinido: false,
      renovacion_automatica: false,
      dia_generacion: 5,
      limite_pago: 10,
      multas_atraso: true,
      tipo_multa: "legal",
      dias_gracia_multa: 3,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateContratoData) => {
      // 1. Crear contrato principal
      const { data: contrato, error: contratoError } = await supabase
        .from("contratos")
        .insert({
          propiedad_id: data.propiedad_id,
          arrendatario_id: data.arrendatario_id,
          org_id: currentOrgId,
          estado: "VIGENTE",
          fecha_inicio: data.fecha_inicio,
          fecha_termino: data.fecha_termino,
          es_indefinido: data.es_indefinido,
          renovacion_automatica: data.renovacion_automatica,
          dia_generacion: data.dia_generacion,
          dia_envio: data.dia_envio,
          limite_pago: data.limite_pago,
          reajuste_ipc: data.reajuste_ipc,
        })
        .select()
        .single();

      if (contratoError) throw contratoError;

      // 2. Crear configuración inicial (v1)
      const { error: configError } = await supabase
        .from("contratos_config_historico")
        .insert({
          contrato_id: contrato.contrato_id,
          vigente_desde: new Date().toISOString(),
          moneda_arriendo: data.moneda_arriendo,
          monto_arriendo: data.monto_arriendo,
          metodo_calculo_uf: data.metodo_calculo_uf,
          tipo_comision: data.tipo_comision,
          valor_comision: data.valor_comision,
          multas_atraso: data.multas_atraso,
          tipo_multa: data.tipo_multa,
          porcentaje_multa: data.porcentaje_multa,
          maximo_multa: data.maximo_multa,
          dias_gracia_multa: data.dias_gracia_multa,
          tipo_garantia: data.tipo_garantia,
          monto_garantia: data.monto_garantia,
          garantia_destinatario: data.garantia_destinatario,
          cuenta_dueno_id: data.cuenta_dueno_id,
          cuenta_admin_id: data.cuenta_admin_id,
          created_by: currentUserId,
        });

      if (configError) throw configError;

      // 3. Actualizar propiedad con contrato actual
      const { error: propError } = await supabase
        .from("propiedades")
        .update({ contrato_actual_id: contrato.contrato_id })
        .eq("propiedad_id", data.propiedad_id);

      if (propError) throw propError;

      return contrato;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos"] });
      queryClient.invalidateQueries({ queryKey: ["propiedades"] });
      toast.success("Contrato creado exitosamente");
    },
    onError: (error) => {
      toast.error("Error al crear contrato");
      console.error(error);
    },
  });

  return (
    <Form {...form}>{/* Formulario completo con todos los campos */}</Form>
  );
}
```

### Ejemplo 2: Actualizar Configuración (Nueva Versión)

```tsx
"use client";

export function UpdateConfigForm({ contratoId }: { contratoId: string }) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateConfigData) => {
      // 1. Cerrar configuración actual
      const { error: closeError } = await supabase
        .from("contratos_config_historico")
        .update({ vigente_hasta: new Date().toISOString() })
        .eq("contrato_id", contratoId)
        .is("vigente_hasta", null);

      if (closeError) throw closeError;

      // 2. Obtener config actual para copiar campos no modificados
      const { data: currentConfig } = await supabase
        .from("contratos_config_historico")
        .select("*")
        .eq("contrato_id", contratoId)
        .not("vigente_hasta", "is", null)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      // 3. Crear nueva versión (version se auto-incrementa con trigger)
      const { error: createError } = await supabase
        .from("contratos_config_historico")
        .insert({
          contrato_id: contratoId,
          vigente_desde: new Date().toISOString(),
          // Copiar campos no modificados de config actual
          ...currentConfig,
          // Sobrescribir con nuevos valores
          ...data,
          created_by: currentUserId,
        });

      if (createError) throw createError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos", contratoId] });
      toast.success("Configuración actualizada");
    },
  });

  return <Form onSubmit={updateMutation.mutate} />;
}
```

### Ejemplo 3: Obtener Contrato con Config Actual

```tsx
"use client";

export function useContrato(contratoId: string) {
  return useQuery({
    queryKey: ["contratos", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select(
          `
          *,
          config_actual:contratos_config_historico!inner(*)
          arrendatario:arrendatarios(*),
          propiedad:propiedades(
            *,
            propietario:propietarios(*)
          ),
          avales(*)
        `
        )
        .eq("contrato_id", contratoId)
        .is("contratos_config_historico.vigente_hasta", null)
        .single();

      if (error) throw error;
      return data as ContratoWithFullDetails;
    },
  });
}

// Uso en componente
export function ContratoDetail({ contratoId }: { contratoId: string }) {
  const { data: contrato, isLoading } = useContrato(contratoId);

  if (isLoading) return <Skeleton />;

  return (
    <div>
      <h1>Contrato {contrato.contrato_id}</h1>
      <p>Arrendatario: {contrato.arrendatario.nombre}</p>
      <p>
        Monto: {contrato.config_actual.moneda_arriendo}{" "}
        {contrato.config_actual.monto_arriendo}
      </p>
      <p>Estado: {contrato.estado}</p>
      {/* ... resto de la UI */}
    </div>
  );
}
```

### Ejemplo 4: Generar Voucher desde Contrato (Integración con Cobranza)

```tsx
// En módulo de cobranza

export async function generateVoucherFromContrato(
  contratoId: string,
  periodo: string
) {
  // 1. Obtener contrato y config actual
  const { data: contratoData } = await supabase
    .from("contratos")
    .select(
      `
      *,
      config:contratos_config_historico!inner(*)
    `
    )
    .eq("contrato_id", contratoId)
    .is("contratos_config_historico.vigente_hasta", null)
    .single();

  const contrato = contratoData;
  const config = contratoData.config;

  // 2. Calcular monto con reajuste IPC si aplica
  let montoFinal = config.monto_arriendo;
  let factorIpc = 1;

  if (contrato.reajuste_ipc) {
    const mesesDesdeInicio = differenceInMonths(
      new Date(),
      contrato.fecha_inicio
    );
    const periodicidad = contrato.reajuste_ipc === "SEMESTRAL" ? 6 : 12;

    if (mesesDesdeInicio >= periodicidad) {
      // Obtener IPC desde vista materializada
      const { data: ipcData } = await supabase
        .from("ipc_mensual")
        .select("*")
        .order("fecha", { ascending: false })
        .limit(1)
        .single();

      // Calcular factor acumulado
      const periodosCompletos = Math.floor(mesesDesdeInicio / periodicidad);
      factorIpc = Math.pow(
        1 + ipcData.variacion_anual / 100,
        periodosCompletos
      );
      montoFinal = config.monto_arriendo * factorIpc;
    }
  }

  // 3. Crear voucher
  const { data: voucher, error } = await supabase
    .from("vouchers")
    .insert({
      contrato_id: contratoId,
      periodo,
      monto_base: config.monto_arriendo,
      monto_reajustado: montoFinal,
      factor_ipc_aplicado: factorIpc,
      config_version_usada: config.version,
      moneda: config.moneda_arriendo,

      // Configuración de multas
      permite_multas: config.multas_atraso,
      tipo_multa: config.tipo_multa,
      porcentaje_multa: config.porcentaje_multa,
      maximo_multa: config.maximo_multa,
      dias_gracia_multa: config.dias_gracia_multa,

      // Fechas
      fecha_generacion: new Date(),
      fecha_vencimiento: calculateVencimiento(contrato.limite_pago),

      estado: "GENERADO",
    })
    .select()
    .single();

  if (error) throw error;

  return voucher;
}
```

## Changelog

### 2025-12-22 - v1.1 (Implementación en BD)

- **Implementado**: Schema completo en base de datos Supabase
- **Agregado**: Tablas stub `arrendatarios` y `cuentas_bancarias` para resolver dependencias
- **Agregado**: Tabla completa `avales` para gestión de avales
- **Implementado**: Triggers para versionado automático y actualización de timestamps
- **Implementado**: RLS completo en todas las tablas (incluidas stub)
- **Implementado**: Políticas de seguridad por organización vía `user_org`
- **Implementado**: Índices optimizados para queries frecuentes
- **Actualizado**: Nomenclatura a `org_id` y `user_org` para consistencia

### 2025-12-17 - v1.0 (Diseño inicial)

- **Diseñado**: Schema inicial con 2 tablas (`contratos`, `contratos_config_historico`)
- **Diseñado**: Sistema de versionado automático con triggers
- **Diseñado**: RLS completo por organización
- **Diseñado**: Soporte para reajuste IPC (on-demand)
- **Diseñado**: Renovación automática de contratos
- **Creado**: Documentación completa del módulo

---

**Última actualización**: 2025-12-22
**Estado**: ✅ Tablas implementadas en BD | ⏳ UI y lógica de negocio pendientes
**Mantenido por**: Sistema Real State Pro
