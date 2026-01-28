# Módulo: [Nombre del Módulo]

> **Template para documentación de módulos**
> Este archivo debe ser copiado y adaptado para cada módulo nuevo.

## Descripción General

[Breve descripción del propósito del módulo y qué problemas resuelve]

## Ubicación

```
app/(main)/[nombre-modulo]/
```

## Responsabilidades

- [Responsabilidad 1]
- [Responsabilidad 2]
- [Responsabilidad 3]

## Componentes Principales

### `nombre-componente.tsx`
**Propósito**: [Qué hace este componente]

**Props**:
```typescript
interface Props {
  prop1: string
  prop2?: number
}
```

**Uso**:
```tsx
<NombreComponente prop1="valor" />
```

### `otro-componente.tsx`
[Similar estructura]

## Hooks Personalizados

### `useNombreHook`
**Ubicación**: `hooks/use-nombre-hook.ts`

**Propósito**: [Para qué sirve]

**Parámetros**:
- `param1: string` - [Descripción]
- `param2?: number` - [Descripción]

**Retorna**:
```typescript
{
  data: Type[]
  isLoading: boolean
  error: Error | null
}
```

**Ejemplo de uso**:
```tsx
const { data, isLoading } = useNombreHook(organizationId)
```

## React Query

### Queries

#### `properties-query`
**Query Key**: `['properties', organizationId]`

**Propósito**: [Qué datos obtiene]

**Código**:
```tsx
const { data } = useQuery({
  queryKey: ['properties', organizationId],
  queryFn: async () => {
    // implementación
  }
})
```

### Mutations

#### `create-property-mutation`
**Propósito**: [Qué hace la mutación]

**Código**:
```tsx
const mutation = useMutation({
  mutationFn: async (data: CreatePropertyData) => {
    // implementación
  },
  onSuccess: () => {
    // invalidar queries relacionadas
  }
})
```

## Flujos de Datos

### Flujo: [Nombre del Flujo]
1. Usuario hace X
2. Componente Y llama hook Z
3. Se ejecuta query/mutation A
4. Se actualiza estado B
5. UI se re-renderiza mostrando C

**Diagrama** (opcional):
```
Usuario → Componente → Hook → Supabase → Estado → UI
```

## Integraciones con Otros Módulos

### Conexión con [Módulo A]
**Tipo**: [Consume datos / Provee datos / Bidireccional]

**Descripción**: [Cómo y por qué se conectan]

**Ejemplo**:
```tsx
// Código de ejemplo de la integración
```

### Conexión con [Módulo B]
[Similar estructura]

## Tablas de Supabase Utilizadas

- `tabla_principal`: [Descripción de uso]
- `tabla_relacionada`: [Descripción de uso]

## Tipos TypeScript

### Tipos Principales

```typescript
type PropertyWithContract = {
  // definición
}

interface CreatePropertyData {
  // definición
}
```

## Estado Global (Zustand)

[Si el módulo usa Zustand, documentar stores específicos]

```typescript
interface ModuleStore {
  // definición
}
```

## Validaciones (Zod)

```typescript
const formSchema = z.object({
  field1: z.string(),
  field2: z.number().optional()
})
```

## Consideraciones Importantes

- [Consideración 1 - por ejemplo: RLS debe estar habilitado]
- [Consideración 2 - por ejemplo: validar inputs antes de mutations]
- [Consideración 3]

## Pendientes / TODOs

- [ ] [Funcionalidad pendiente]
- [ ] [Mejora futura]
- [ ] [Bug conocido]

## Ejemplos de Uso Completo

### Ejemplo 1: [Caso de uso común]
```tsx
// Código completo del ejemplo
```

### Ejemplo 2: [Otro caso de uso]
```tsx
// Código completo del ejemplo
```

## Changelog

### [Fecha] - [Versión]
- **Agregado**: [Nuevas funcionalidades]
- **Modificado**: [Cambios en funcionalidades existentes]
- **Corregido**: [Bugs resueltos]

---

**Última actualización**: [Fecha]
**Mantenido por**: [Nombre o equipo]
