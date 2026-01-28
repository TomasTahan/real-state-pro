# Guía de Inicio Rápido para Claude

Esta guía te ayudará a entender rápidamente el proyecto cuando el usuario te pida trabajar en él.

## Checklist Rápido

Cuando el usuario te pida trabajar en este proyecto:

- [ ] Leer `CLAUDE.md` para contexto completo del proyecto
- [ ] Identificar el **módulo** donde trabajarás
- [ ] Leer el `README.md` del módulo (si existe)
- [ ] Verificar patrones de código en `CODE_PATTERNS.md`
- [ ] Confirmar que entiendes la organización multi-tenant (RLS crítico)
- [ ] Recordar: Siempre preguntar antes de actualizar README de módulo

## Comandos Útiles

```bash
# Desarrollo
pnpm dev                 # Iniciar servidor desarrollo

# Tipos
pnpm types:update       # Actualizar tipos desde Supabase

# Build
pnpm build              # Construir para producción
pnpm start              # Iniciar producción local

# Linting
pnpm lint               # Ejecutar ESLint
```

## Flujo de Trabajo Típico

### 1. Nueva Feature
1. Identificar módulo correspondiente
2. Leer README del módulo
3. Crear componentes en `app/(main)/[modulo]/`
4. Usar React Query para datos
5. Seguir patrones de `CODE_PATTERNS.md`
6. **Al finalizar**: Preguntar si actualizar README del módulo

### 2. Bug Fix
1. Identificar archivo/módulo afectado
2. Revisar logs en tabla `logs` de Supabase (si aplica)
3. Corregir el bug
4. Agregar manejo de errores si faltaba
5. Actualizar README del módulo si cambia comportamiento

### 3. Refactoring
1. Mantener patrones existentes
2. No sobre-ingenierizar (regla de 3+ usos)
3. Mantener componentes grandes si son claros
4. Actualizar README del módulo afectado

## Reglas de Oro

### 🔴 CRITICAL - Siempre hacer
1. **Filtrar por `organizacion_id`** en todas las queries
2. **Usar React Query** para toda interacción con Supabase
3. **Loguear errores** a tabla `logs`
4. **Usar Client Components** por defecto (`'use client'`)
5. **Preguntar antes** de actualizar README de módulo

### 🟡 IMPORTANTE - Recordar
1. Queries inline si solo se usan 1-2 veces
2. Hooks reutilizables si se usan 3+ veces
3. Componentes grandes están bien
4. kebab-case para nombres de archivos
5. Toast para errores de usuario

### 🟢 NICE TO HAVE - Buenas prácticas
1. Optimistic updates cuando tenga sentido
2. Loading states claros
3. Comentarios solo cuando sea necesario
4. Tipos bien definidos

## Estructura de Directorios

```
real-state-pro/
├── app/
│   ├── (main)/              # App principal autenticada
│   │   ├── cobranza/       # Módulo de vouchers y pagos
│   │   ├── propiedades/    # Módulo de propiedades y contratos
│   │   ├── bitacora/       # Módulo de eventos
│   │   ├── dashboard/      # Módulo de métricas
│   │   ├── servicios/      # Módulo de servicios básicos
│   │   └── errores/        # Módulo de gestión de errores
│   ├── auth/               # Páginas de autenticación
│   └── api/                # API routes (solo webhooks)
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── sidebar/            # Componentes del sidebar
│   └── auth/               # Componentes de auth
├── hooks/                  # Hooks reutilizables (3+ usos)
├── lib/
│   ├── supabase/          # Supabase clients
│   ├── types/             # Tipos generados y custom
│   ├── utils.ts           # Utilidades generales
│   └── error-handler.ts   # Manejo centralizado de errores
└── .claude/               # Documentación del proyecto
    ├── CLAUDE.md          # Documento principal
    ├── CODE_PATTERNS.md   # Patrones de código
    ├── QUICK_START.md     # Esta guía
    └── MODULE_README_TEMPLATE.md  # Template para READMEs
```

## Módulos Principales

### Cobranza
- **Ubicación**: `app/(main)/cobranza/`
- **Propósito**: Gestión de vouchers, pagos, multas, descuentos
- **Tablas**: `vouchers`, `payouts`, `contratos`
- **Integraciones**: ETPAY, Bitácora, Servicios

### Propiedades
- **Ubicación**: `app/(main)/propiedades/`
- **Propósito**: Administración de propiedades y contratos
- **Tablas**: `propiedades`, `contratos`, `arrendatarios`, `propietarios`
- **Integraciones**: IA (Gemini), Cobranza

### Bitácora
- **Ubicación**: `app/(main)/bitacora/`
- **Propósito**: Registro histórico de eventos por propiedad
- **Tablas**: `bitacora_propiedades`
- **Integraciones**: Cobranza (cargos/reembolsos)

### Dashboard
- **Ubicación**: `app/(main)/dashboard/`
- **Propósito**: Métricas y visualización de datos
- **Tablas**: Todas (queries agregadas)
- **Integraciones**: Todos los módulos

### Servicios
- **Ubicación**: `app/(main)/servicios/`
- **Propósito**: Gestión de servicios básicos y gastos comunes
- **Tablas**: `servicios`, `empresas_servicio`, `consultas_deuda`
- **Integraciones**: Browser Bot, Cobranza

## Supabase - Info Rápida

### Conexión
```tsx
import { createBrowserClient } from '@/lib/supabase/client'
const supabase = createBrowserClient()
```

### Query Típico
```tsx
const { data, error } = await supabase
  .from('tabla')
  .select('*, relacion:tabla_relacionada(*)')
  .eq('organizacion_id', organizationId)
```

### Insert
```tsx
const { data, error } = await supabase
  .from('tabla')
  .insert([{ campo: 'valor', organizacion_id: organizationId }])
  .select()
```

### Update
```tsx
const { data, error } = await supabase
  .from('tabla')
  .update({ campo: 'nuevo_valor' })
  .eq('id', id)
  .select()
```

## React Query - Info Rápida

### Query
```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['resource', organizationId],
  queryFn: async () => {
    const { data } = await supabase.from('tabla').select()
    return data
  }
})
```

### Mutation
```tsx
const mutation = useMutation({
  mutationFn: async (data) => {
    const { data: result } = await supabase.from('tabla').insert([data])
    return result
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['resource'] })
    toast.success('Éxito')
  }
})
```

## shadcn/ui + Zod Form

```tsx
const formSchema = z.object({
  field: z.string().min(1, 'Requerido')
})

const form = useForm<z.infer<typeof formSchema>>({
  resolver: zodResolver(formSchema),
  defaultValues: { field: '' }
})

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField
      control={form.control}
      name="field"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Campo</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

## Debugging

### Ver logs de errores
```sql
-- En Supabase SQL Editor
SELECT * FROM logs
WHERE importancia = 'ERROR'
ORDER BY created_at DESC
LIMIT 50;
```

### Errores comunes

1. **"Row Level Security" error**
   - Solución: Verificar que query incluya `organizacion_id`

2. **"Invalid query key"**
   - Solución: Query key debe ser array: `['key', param]`

3. **"Cannot read property of undefined"**
   - Solución: Agregar optional chaining `data?.property`

4. **"Hydration error"**
   - Solución: Asegurar que componente sea Client Component (`'use client'`)

## Preguntas Frecuentes

**P: ¿Cuándo crear un hook reutilizable?**
R: Solo cuando la query/mutation se use en 3 o más componentes.

**P: ¿Usar Server o Client Components?**
R: Client Components por defecto. Server solo si hay razón específica.

**P: ¿Cómo manejar errores?**
R: Toast para usuario + `logError()` a tabla logs.

**P: ¿Cuándo actualizar README de módulo?**
R: Siempre preguntar al usuario si considera que la implementación está finalizada.

**P: ¿Usar API Routes?**
R: Solo para webhooks y operaciones que requieren Service Role Key.

**P: ¿Dónde están los tipos de Supabase?**
R: En `lib/types/database.types.ts` (generar con `pnpm types:update`)

## Recursos

- **Supabase Docs**: https://supabase.com/docs
- **TanStack Query**: https://tanstack.com/query/latest
- **shadcn/ui**: https://ui.shadcn.com
- **Zod**: https://zod.dev
- **Zustand**: https://zustand-demo.pmnd.rs

---

**Última actualización**: 2025-12-17
