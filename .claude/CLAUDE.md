# Real State Pro - Sistema de Gestión de Arriendos

## Descripción General

Real State Pro es una aplicación web para empresas de corretaje que automatiza la gestión completa de arriendos. El sistema permite administrar propiedades, generar contratos con IA, realizar cobros automatizados mediante pasarela de pago, distribuir pagos a propietarios y administración, y llevar un registro histórico de eventos por propiedad.

## Stack Técnico

### Frontend

- **Framework**: Next.js 16 (App Router)
- **Lenguaje**: TypeScript 5.9
- **UI Framework**: React 19
- **Estilos**: Tailwind CSS 4
- **Componentes UI**: shadcn/ui (Radix UI)
- **Iconos**: Lucide React, Tabler Icons

### Backend & Servicios

- **Base de datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth
- **Storage**: Supabase Storage (para contratos PDF/Word)
- **Realtime**: Supabase Realtime
- **Estado global**: Zustand
- **Data fetching**: TanStack React Query (v5)
- **Pasarela de pago**: ETPAY
- **IA para contratos**: OpenRouter
- **Email**: Resend / Webhook (n8n)
- **Cron Jobs**: QStash (Upstash)

### Integraciones Externas

- **Browser Bot**: browser-use (servicio en la nube para scraping de Servipag)
- **API del Bot**: Endpoint en VPS para consultar servicios básicos
- **n8n**: Webhook para automatizaciones

### Deployment

- **Hosting**: Vercel
- **Ambientes**: Solo development (local) y production (Vercel)
- **Control de versiones**: Git

## Arquitectura del Sistema

### Modelo Multi-tenant (Organizaciones)

El sistema usa arquitectura de organizaciones donde:

- Una **organización** puede tener múltiples usuarios (admins)
- Cada **organización** puede gestionar múltiples propiedades
- Cada **propiedad** tiene un propietario y puede tener múltiples contratos (histórico)
- Cada **contrato** tiene un arrendatario y genera vouchers de cobro
- RLS (Row Level Security) está habilitado en todas las tablas para seguridad multi-tenant

### Roles de Usuario (Actuales y Futuros)

- **Corredor/Admin** (implementado): Gestiona propiedades, contratos, cobros, bitácora
- **Propietario** (futuro): Verá sus propiedades, pagos recibidos, estado de arriendos
- **Arrendatario** (futuro): Pagará arriendos, verá sus vouchers, historial de pagos

## Módulos del Sistema

### 1. Módulo de Cobranza

**Propósito**: Automatizar el cobro de arriendos y distribución de pagos

**Flujo**:

1. Sistema genera vouchers automáticamente según configuración del contrato
2. Envía voucher al arrendatario por email
3. Arrendatario paga mediante ETPAY
4. Sistema recibe webhook de pago exitoso
5. Distribuye dinero automáticamente:
   - Propietario recibe su parte (arriendo - comisión - impuestos)
   - Administración recibe comisión

**Características**:

- Generación automática de vouchers (configurable por contrato)
- Cálculo automático de multas por atraso (legal 37.92% anual o personalizado)
- Días de gracia antes de aplicar multas
- Soporte para descuentos (fijo CLP/UF, porcentaje, arriendo gratis)
- Cargos/reembolsos adicionales desde bitácora
- Integración con servicios básicos (agua, luz, gas)
- Validación de cuenta bancaria ($1 CLP)
- Recordatorios automáticos de pago

**Tablas relacionadas**:

- `vouchers`: Vouchers de cobro generados
- `payouts`: Pagos realizados a propietarios/administración
- `contratos`: Configuración de cobros, multas, descuentos
- `cuentas_bancarias`: Cuentas para recibir pagos

### 2. Módulo de Administración de Propiedades

**Propósito**: Gestionar contratos y propiedades con ayuda de IA

**Características**:

- **Generación de contratos con IA**: A partir de plantillas, la IA genera contratos personalizados
- **Tipos de contrato**: Nuevos o existentes (subir PDF/Word)
- **Extracción de datos**: La IA extrae información del contrato para crear la propiedad en BD
- **Configuración completa**:
  - Datos de propiedad (tipo, ubicación, características)
  - Datos de arrendatario y propietario
  - Montos (CLP, UF) con reajuste IPC opcional
  - Calendario de cobros (generación, envío, vencimiento)
  - Multas y descuentos
  - Garantías
  - Comisiones de administración
  - Cuentas bancarias para liquidación

**Tablas relacionadas**:

- `contratos`: Contrato activo y configuración
- `propiedades`: Datos de la propiedad
- `arrendatarios`: Información del arrendatario
- `propietarios`: Información del propietario
- `avales`: Avales del contrato (si aplica)

### 3. Módulo de Bitácora

**Propósito**: Registro histórico de eventos y gestión de cargos/descuentos extraordinarios

**Características**:

- Registro de eventos por categoría:
  - Mantenimiento
  - Incidente
  - Visita
  - Administrativo
  - Comunicación
  - Documento
  - Otro
- Cargos extraordinarios (reparaciones, daños, etc.)
- Reembolsos/descuentos
- Integración con vouchers: cargos/reembolsos se agregan automáticamente al próximo voucher
- Historial completo de la "hoja de vida" de cada propiedad
- Registro de autor y fecha del evento

**Tablas relacionadas**:

- `bitacora_propiedades`: Registro de eventos

### 4. Módulo de Dashboard

**Propósito**: Vista general de métricas y estado de la organización

**Características esperadas**:

- Propiedades con deuda
- Ingresos del mes/meses anteriores
- Vouchers pendientes/pagados/vencidos
- Gráficos de tendencias
- Alertas importantes
- Resumen de ocupación

### 5. Módulo de Servicios Básicos y Gastos Comunes

**Propósito**: Monitorear pagos de servicios básicos de las propiedades

**Características**:

- **Browser Bot**: Automatiza consultas en portal Servipag
- Consulta automática de deuda por propiedad
- Soporte para múltiples empresas:
  - Agua (Aguas Andinas, Essbio, etc.)
  - Gas (Metrogas, Lipigas, etc.)
  - Electricidad (Enel, CGE, etc.)
- Historial de consultas
- Configuración de credenciales por propiedad
- Opción para incluir deuda de servicios en voucher de arriendo
- Gestión manual o automática

**Tablas relacionadas**:

- `servicios`: Configuración de servicios por propiedad
- `empresas_servicio`: Catálogo de empresas y sus URLs en Servipag
- `consultas_deuda`: Historial de consultas al bot

## Estructura de Base de Datos

### Tablas Principales

#### `organizaciones`

- Multi-tenant root
- Configuración de emails (Resend o Webhook)
- Logo y branding

#### `users`

- Usuarios autenticados
- Vinculados a `auth.users` de Supabase

#### `user_organizacion`

- Relación many-to-many entre users y organizaciones
- Define rol del usuario en la organización

#### `propietarios`

- Dueños de propiedades
- Puede ser persona natural o empresa
- Vinculado opcionalmente a un user (para acceso futuro)

#### `arrendatarios`

- Inquilinos que arriendan
- Datos de contacto y domicilio

#### `propiedades`

- Propiedades administradas
- Referencia a `contrato_actual_id`
- Datos físicos y ubicación

#### `contratos`

- Configuración completa del arriendo
- Referencia a propiedad, arrendatario, propietario
- Estados: VIGENTE, TERMINADO, SUSPENDIDO
- Configuración de cobros, multas, descuentos, garantías

#### `vouchers`

- Documentos de cobro generados
- Estados: GENERADO, ENVIADO, PAGADO, VENCIDO, ANULADO
- Incluye servicios básicos opcionalmente
- Detalles de pago (ETPAY)

#### `payouts`

- Pagos realizados vía ETPAY
- Tipos: PROPIETARIO (liquidación) o ADMINISTRACION (comisión)
- Estados: pending, processing, completed, failed

#### `cuentas_bancarias`

- Cuentas de propietarios y administración
- Para recibir pagos automáticos

#### `bitacora_propiedades`

- Eventos históricos por propiedad
- Cargos/reembolsos a incluir en vouchers

#### `avales`

- Avales de contratos

#### `servicios`

- Configuración de servicios básicos por propiedad
- Credenciales para consultas automáticas

#### `empresas_servicio`

- Catálogo de empresas de servicios
- URLs de Servipag

#### `consultas_deuda`

- Historial de consultas al bot

#### `logs`

- Logs del sistema (debugging)

## Patrones y Convenciones de Código

### React Query

- **Usar para**: Todas las queries y mutations a Supabase
- **Estructura de queries**:
  - Queries en hooks personalizados: `useProperties`, `useContracts`, etc.
  - Query keys con array: `['properties', organizationId]`
  - Invalidación manual cuando sea necesario
- **Caché**: Configurar `staleTime` y `cacheTime` según necesidad

### Zustand

- **Usar para**: Estado global de la app (user, org seleccionada, UI state)
- **No usar para**: Datos del servidor (usar React Query)

### Supabase

- **Client-side**: Usar `createBrowserClient` con cookies
- **Server-side**: Usar `createServerClient` en Server Components y Server Actions
- **RLS**: Todas las queries deben respetar RLS
- **Realtime**: Suscripciones para actualizaciones en tiempo real

### Componentes

- **Preferir**: Client Components
- **UI Components**: Reutilizar shadcn/ui, extender cuando sea necesario
- **Composición**: Componentes pequeños solo cuando se va a saber que son reutilizables, sino todo el componente en 1 archivo grande

### Error Handling

- **Toast notifications**: Usar `sonner` para feedback al usuario
- **Error logging**: Todos los errores se registran automáticamente en tabla `logs` de Supabase
- **Módulo de Errores**: Sistema centralizado para tracking y solución de errores
  - Cada error capturado se guarda con contexto completo
  - Permite monitoreo y detección temprana de problemas
  - Facilita debugging y corrección proactiva
- **Error Boundaries**: Para errores críticos de React (también se loguean)
- **Try/catch**: En mutations y operaciones críticas (con logging automático)

### TypeScript

- **Tipos de Supabase**: Generar automáticamente con CLI
- **Tipos custom**: Definir en archivos `.types.ts`
- **Validación**: (pendiente definir librería)

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ETPAY
ETPAY_MERCHANT_CODE=
ETPAY_MERCHANT_API_TOKEN=

# Resend
RESEND_API_KEY=

# Agent API (Browser Bot)
AGENT_API_URL=

# QStash (Cron Jobs)
QSTASH_URL=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# App
NEXT_PUBLIC_APP_URL=
CRON_SECRET=

# n8n
NEXT_PUBLIC_GASTOS_COMUNES=

# Database (opcional, para migraciones)
DB_DEV=
DB_PROD=
```

## Flujos de Negocio Importantes

### Flujo de Generación de Voucher

1. Cron job revisa contratos activos
2. Por cada contrato, verifica si debe generar voucher según configuración
3. Crea voucher con:
   - Monto de arriendo (puede estar reajustado por IPC)
   - Descuentos aplicables del período
   - Cargos/reembolsos de bitácora pendientes
4. Programa envío de email según configuración del contrato
5. Email contiene link de pago con ETPAY

### Flujo de Pago

1. Arrendatario recibe email con voucher
2. Accede a página de pago (pública, sin login)
3. Opcionalmente selecciona servicios básicos a pagar
4. Primera vez: valida cuenta con pago de $1 CLP
5. Realiza pago completo
6. ETPAY envía webhook de confirmación
7. Sistema marca voucher como PAGADO
8. Activa proceso de distribución de pago (payouts)

### Flujo de Distribución de Pago (Payouts)

1. Webhook de pago exitoso llega
2. Sistema calcula montos:
   - Propietario: arriendo - comisión admin - impuestos
   - Administración: comisión + impuestos
3. Crea registros en tabla `payouts`
4. Llama API de ETPAY para transferir a cuentas bancarias
5. ETPAY envía webhook con resultado de transferencia
6. Sistema actualiza estado de payouts

### Flujo de Multas por Atraso

1. Cron job diario revisa vouchers vencidos
2. Por cada voucher vencido no pagado:
   - Calcula días de atraso (descontando días de gracia)
   - Aplica tasa de interés (legal 37.92% anual o personalizada)
   - Actualiza `monto_multa_atraso` y `monto_total_a_pagar`
   - Actualiza `dias_atraso_efectivos`
3. Multa se agrega al monto total del voucher

### Flujo de Reajuste IPC

1. Cron job mensual/semestral según configuración
2. Por contratos con `variacion_ipc_clp` configurado:
   - Obtiene IPC actual del Banco Central
   - Calcula nuevo monto reajustado
   - Actualiza `monto_reajustado` en contrato
   - Registra factor acumulado y fecha de cálculo
3. Próximos vouchers usan el monto reajustado

## Integraciones Técnicas

### ETPAY

- **Cobros**: Payment links para arrendatarios
- **Payouts**: Transferencias a propietarios y administración
- **Webhooks**: Notificaciones de estado de pagos
- **Validación**: Pago de $1 para validar cuenta bancaria

### OpenRouter (IA)

- **Uso**: Generación de contratos desde plantillas
- **Modelo principal**: Google Gemini 3.0 Flash (lanzado 2025-12-17)
- **Modelo alternativo**: Claude (via Claude Agent SDK) para casos específicos
- **Prompts**: Incluyen contexto de la propiedad, partes, y términos

### Browser Bot (browser-use)

- **Servicio**: En la nube de browser-use
- **Endpoint**: VPS propio con API REST (completamente funcional)
- **Función**: Scraping de portal Servipag
- **Input**: Empresa, número de cliente/RUT
- **Output**: Monto de deuda, fecha vencimiento, metadata
- **Estado**: Producción activa

### Resend / n8n

- **Resend**: Envío directo de emails transaccionales
- **Webhook n8n**: Alternativa para orgs que prefieren control externo
- **Configuración**: Por organización en tabla `organizaciones`

### QStash

- **Uso**: Cron jobs y tareas programadas
- **Tareas**:
  - Generación diaria de vouchers
  - Envío de vouchers según calendario
  - Cálculo diario de multas
  - Recordatorios de pago
  - Reajuste IPC periódico
  - Consulta de servicios básicos

## Convenciones de Commit

- Usar commits descriptivos en español
- Ejemplo: "feat: agregar módulo de bitácora"
- Ejemplo: "fix: corregir cálculo de multas"
- Ejemplo: "refactor: reorganizar estructura de carpetas"

## Consideraciones de Seguridad

- **RLS habilitado**: Todas las tablas públicas tienen RLS
- **Políticas de acceso**: Por organización
- **Service Role**: Solo en Server Actions cuando sea estrictamente necesario
- **Validación**: Validar inputs antes de queries
- **Sanitización**: Evitar SQL injection, XSS
- **Secrets**: Variables sensibles en `.env`, nunca en código
- **Webhooks**: Validar signatures (ETPAY, QStash)

## Estructura de Proyecto y Organización

### Arquitectura de Módulos

El proyecto se organiza en **módulos independientes**, cada uno con su propia carpeta y documentación:

```
app/
  (main)/
    cobranza/           # Módulo de cobranza y vouchers
    propiedades/        # Módulo de propiedades y contratos
    bitacora/          # Módulo de bitácora
    dashboard/         # Módulo de dashboard
    servicios/         # Módulo de servicios básicos
    errores/           # Módulo de gestión de errores (sistema)
```

**IMPORTANTE**: Cada módulo debe contener:

- `README.md`: Documentación completa del módulo
  - Función y propósito
  - Componentes principales
  - Flujos de datos
  - Queries y mutations de React Query
  - Integraciones con otros módulos
  - Ejemplos de uso
- Componentes del módulo
- Hooks específicos del módulo (si se usan en 3+ componentes)
- Tipos específicos del módulo

### Regla de Actualización de Documentación de Módulos

**CRITICAL**: Cuando Claude haga modificaciones a un módulo:

1. Debe actualizar el `README.md` del módulo automáticamente
2. **ANTES** de actualizar el README, debe preguntar al usuario: "¿Consideras que esta implementación está finalizada para actualizar la documentación del módulo?"
3. Solo después de confirmación del usuario, actualizar el README
4. El README debe reflejar el estado actual completo del módulo

### Conexiones Entre Módulos

Los módulos se conectan de la siguiente manera:

- **Cobranza** ← **Bitácora** (cargos/reembolsos se incluyen en vouchers)
- **Cobranza** ← **Servicios** (deudas de servicios en vouchers)
- **Propiedades** → **Cobranza** (contratos generan vouchers)
- **Propiedades** → **Bitácora** (eventos por propiedad)
- **Dashboard** ← **Todos** (métricas agregadas)

### Naming Conventions

- **Archivos de componentes**: `kebab-case.tsx` (ej: `user-profile.tsx`)
- **Componentes**: `PascalCase` (ej: `UserProfile`)
- **Hooks**: `camelCase` con prefijo `use` (ej: `useProperties`)
- **Funciones**: `camelCase` (ej: `calculateMonthlyRent`)
- **Constantes**: `UPPER_SNAKE_CASE` (ej: `MAX_RETRY_ATTEMPTS`)
- **Tipos**: `PascalCase` (ej: `PropertyWithContract`)

### Patrones de Código Establecidos

#### Client Components por Defecto

- **Todas las páginas son Client Components** (`'use client'`)
- Server Components solo cuando haya una razón específica para usarlos
- Preferir Client Components para mejor interactividad y DX

#### React Query y Hooks Reutilizables

**Regla de reutilización**:

- Query/mutation usada en **1-2 componentes**: Definir directamente en el componente
- Query/mutation usada en **3+ componentes**: Extraer a hook reutilizable

**Ejemplo de query inline (solo 1-2 usos)**:

```tsx
// Dentro del componente
const { data: properties } = useQuery({
  queryKey: ["properties", organizationId],
  queryFn: async () => {
    const { data } = await supabase
      .from("propiedades")
      .select("*")
      .eq("organizacion_id", organizationId);
    return data;
  },
});
```

**Ejemplo de hook reutilizable (3+ usos)**:

```tsx
// hooks/use-properties.ts
export function useProperties(organizationId: string) {
  return useQuery({
    queryKey: ["properties", organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("propiedades")
        .select("*")
        .eq("organizacion_id", organizationId);
      return data;
    },
  });
}
```

#### Tamaño de Componentes

- **No preocuparse por componentes grandes**: Está bien tener componentes de 200-300+ líneas
- **Razón**: Los componentes rara vez se reutilizan, priorizar legibilidad
- **Mejor**: Un componente grande y fácil de entender que múltiples componentes pequeños fragmentados
- **Extraer solo cuando**: Se va a reutilizar realmente o mejora significativamente la legibilidad

### Validación de Formularios

- **Usar**: shadcn/ui Form component (basado en react-hook-form + Zod)
- **Patrón**:
  ```tsx
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {...}
  })
  ```

### Manejo de Tipos TypeScript

- **Generar tipos de Supabase automáticamente**
- **Comando**: Crear comando en `package.json` para actualizar tipos
  ```json
  "scripts": {
    "types:update": "supabase gen types typescript --project-id <id> > lib/types/database.types.ts"
  }
  ```
- **Uso**: Cuando se modifique schema de Supabase, correr `pnpm types:update`
- **Tipos custom**: Definir en archivos separados `*.types.ts` cuando sea necesario

### API Routes - Uso Mínimo

- **Evitar API Routes** cuando sea posible
- **Razón**: Latencia - App en Vercel (EEUU) → API Route (EEUU) → Supabase (Brasil) → Usuarios (Chile)
- **Preferir**: TanStack Query directo desde cliente → Supabase (Brasil) → Usuarios (Chile)
- **Usar API Routes solo para**:
  - Webhooks externos (ETPAY, QStash)
  - Llamadas que requieren Service Role Key
  - Lógica que no debe exponerse al cliente

### Testing

- **No se implementan tests** por el momento
- Esta decisión puede cambiar en el futuro
- Si se implementan, evaluar opciones más adelante

## Roadmap Futuro

### Corto plazo

- Implementar módulos faltantes
- Definir estructura de carpetas definitiva
- Establecer convenciones de código
- Agregar manejo de errores consistente

### Mediano plazo

- Portal para propietarios
- Portal para arrendatarios
- Sistema de notificaciones avanzado
- Dashboard con analytics
- Reportes y exportación de datos

### Largo plazo

- Multi-idioma
- Mobile app
- Integración con más pasarelas de pago
- IA para predicción de morosidad
- Automatización de cobranza judicial

---

## Notas Importantes para Claude

### Reglas Críticas de Desarrollo

1. **Siempre verificar organización**: Todas las queries deben filtrar por `organizacion_id`
2. **RLS es crítico**: No usar service role client a menos que sea absolutamente necesario
3. **React Query es obligatorio**: No hacer fetch directo a Supabase sin React Query
4. **Validar contratos**: La configuración de contratos es compleja, validar coherencia
5. **Cuidado con estados de vouchers**: Los estados tienen flujo específico, no saltarse pasos
6. **Multas son sensibles**: Cálculo incorrecto puede generar problemas legales
7. **Payouts son críticos**: Validar montos antes de transferir dinero real
8. **Consistencia**: Mantener patrones establecidos en código existente
9. **No sobre-ingeniería**: Soluciones simples y directas
10. **Testing en local**: Siempre probar flujos completos antes de commitear

### Workflow de Documentación de Módulos

Cuando modifiques un módulo existente o crees uno nuevo:

1. **Durante el desarrollo**: Trabajar normalmente en el código
2. **Antes de finalizar**: Preguntar explícitamente al usuario:
   > "¿Consideras que esta implementación está finalizada para actualizar la documentación del módulo [nombre]?"
3. **Si el usuario confirma**: Actualizar el `README.md` del módulo con:
   - Cambios realizados
   - Nuevos componentes/hooks
   - Flujos actualizados
   - Ejemplos de uso
   - Conexiones con otros módulos
4. **Si el usuario dice que no**: Continuar con desarrollo sin actualizar documentación

**IMPORTANTE**: NUNCA actualizar el README del módulo sin preguntar primero al usuario.

### Filosofía de Código

- **Client-first**: Preferir Client Components y queries directas
- **Simplicidad**: Un componente grande claro > múltiples componentes pequeños confusos
- **Pragmatismo**: No crear abstracciones hasta que se necesiten realmente (regla de 3+ usos)
- **Documentación viva**: Los README de módulos son críticos, mantenerlos actualizados
- **Error visibility**: Todos los errores deben ser visibles en tabla `logs` para debugging proactivo
- **Latencia mínima**: Evitar hops innecesarios (por eso cliente → Supabase directo)
- **Velocidad rapida**: Es muy importante que la navegacion sea instantánea, para esto el uso de cache y loadings minimos.

## TIPS

- Cada vez que empecemos una sesion, tienes disponible en /.claude/QUICK_START.md para saber como empezar
- No crees documentacion innecesaria a menos de que yo te la pida explicitamente
- Hay una carpeta llamada modules en donde están todas las implemetaciones generales separadas. Dentro de cada una hay un README.md que explica como funciona y como se usa. Leelo en caso de que se te pida algo respecto a una implementaciond de un modulo

---

**Última actualización**: 2025-12-17
