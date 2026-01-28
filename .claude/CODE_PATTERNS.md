# Patrones de Código - Real State Pro

Este documento contiene ejemplos de código y patrones comunes para mantener consistencia en el proyecto.

## Estructura de un Componente Típico

```tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface PropertyListProps {
  organizationId: string
}

export function PropertyList({ organizationId }: PropertyListProps) {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  // Query inline (si solo se usa aquí)
  const { data: properties, isLoading, error } = useQuery({
    queryKey: ['properties', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select('*, propietario:propietarios(*), contrato_actual:contratos(*)')
        .eq('organizacion_id', organizationId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    }
  })

  // Mutation inline
  const createPropertyMutation = useMutation({
    mutationFn: async (propertyData: CreatePropertyData) => {
      const { data, error } = await supabase
        .from('propiedades')
        .insert([{ ...propertyData, organizacion_id: organizationId }])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Propiedad creada exitosamente')
      queryClient.invalidateQueries({ queryKey: ['properties', organizationId] })
    },
    onError: (error) => {
      toast.error('Error al crear propiedad')
      // Log error to Supabase logs table
      logError('create-property', error)
    }
  })

  if (isLoading) return <div>Cargando...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      {properties?.map(property => (
        <div key={property.propiedad_id}>
          {/* Renderizado de propiedad */}
        </div>
      ))}
      <Button onClick={() => createPropertyMutation.mutate(newPropertyData)}>
        Crear Propiedad
      </Button>
    </div>
  )
}

// Tipos
interface CreatePropertyData {
  calle: string
  numero: string
  // ...
}

// Helper para logging de errores
async function logError(fuente: string, error: any) {
  const supabase = createBrowserClient()
  await supabase.from('logs').insert({
    fuente,
    importancia: 'ERROR',
    resumen: error.message,
    detalles: { stack: error.stack, timestamp: new Date().toISOString() }
  })
}
```

## Hook Reutilizable (3+ usos)

```tsx
// hooks/use-properties.ts
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'

export function useProperties(organizationId: string) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ['properties', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select('*, propietario:propietarios(*)')
        .eq('organizacion_id', organizationId)

      if (error) throw error
      return data
    },
    enabled: !!organizationId, // Solo ejecutar si hay org ID
    staleTime: 5 * 60 * 1000, // 5 minutos
  })
}

// Uso en componente
import { useProperties } from '@/hooks/use-properties'

function MyComponent() {
  const { data: properties } = useProperties(orgId)
  // ...
}
```

## Formulario con shadcn/ui + Zod

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const formSchema = z.object({
  nombre: z.string().min(2, 'Nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  telefono: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

export function PropertyForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nombre: '',
      email: '',
      telefono: '',
    },
  })

  async function onSubmit(values: FormData) {
    try {
      // Lógica de submit
      console.log(values)
      toast.success('Formulario enviado')
    } catch (error) {
      toast.error('Error al enviar formulario')
      logError('property-form', error)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input placeholder="Juan Pérez" {...field} />
              </FormControl>
              <FormDescription>
                Nombre del propietario
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Más campos... */}
        <Button type="submit">Enviar</Button>
      </form>
    </Form>
  )
}
```

## Supabase Client Setup

```tsx
// lib/supabase/client.ts
import { createBrowserClient as createClient } from '@supabase/ssr'

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!
  )
}

// Uso
import { createBrowserClient } from '@/lib/supabase/client'

const supabase = createBrowserClient()
```

## Manejo de Errores Centralizado

```tsx
// lib/error-handler.ts
import { createBrowserClient } from '@/lib/supabase/client'

interface LogErrorOptions {
  fuente: string
  error: any
  importancia?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  metadata?: Record<string, any>
}

export async function logError({
  fuente,
  error,
  importancia = 'ERROR',
  metadata = {}
}: LogErrorOptions) {
  const supabase = createBrowserClient()

  const errorDetails = {
    message: error?.message || 'Unknown error',
    stack: error?.stack,
    timestamp: new Date().toISOString(),
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server',
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    ...metadata
  }

  try {
    await supabase.from('logs').insert({
      fuente,
      importancia,
      resumen: errorDetails.message,
      detalles: errorDetails
    })
  } catch (logError) {
    // Si falla el logging, al menos loguearlo en consola
    console.error('Failed to log error:', logError)
    console.error('Original error:', error)
  }
}

// Uso
import { logError } from '@/lib/error-handler'

try {
  // operación
} catch (error) {
  toast.error('Ocurrió un error')
  logError({
    fuente: 'create-voucher',
    error,
    importancia: 'CRITICAL',
    metadata: { voucherId: 'abc123' }
  })
}
```

## Realtime Subscription

```tsx
'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'

export function VoucherList({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient()
  const supabase = createBrowserClient()

  // Query normal
  const { data: vouchers } = useQuery({
    queryKey: ['vouchers', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('vouchers')
        .select('*')
        .eq('organizacion_id', organizationId)
      return data
    }
  })

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('vouchers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vouchers',
          filter: `organizacion_id=eq.${organizationId}`
        },
        (payload) => {
          console.log('Change received!', payload)
          // Invalidar query para refrescar datos
          queryClient.invalidateQueries({ queryKey: ['vouchers', organizationId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [organizationId, queryClient, supabase])

  return (
    <div>
      {vouchers?.map(voucher => (
        <div key={voucher.voucher_id}>{/* ... */}</div>
      ))}
    </div>
  )
}
```

## Zustand Store

```tsx
// stores/use-organization-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OrganizationStore {
  currentOrgId: string | null
  setCurrentOrgId: (id: string) => void
  clearCurrentOrg: () => void
}

export const useOrganizationStore = create<OrganizationStore>()(
  persist(
    (set) => ({
      currentOrgId: null,
      setCurrentOrgId: (id) => set({ currentOrgId: id }),
      clearCurrentOrg: () => set({ currentOrgId: null }),
    }),
    {
      name: 'organization-storage', // nombre en localStorage
    }
  )
)

// Uso
import { useOrganizationStore } from '@/stores/use-organization-store'

function MyComponent() {
  const { currentOrgId, setCurrentOrgId } = useOrganizationStore()

  return (
    <div>
      <p>Org actual: {currentOrgId}</p>
      <button onClick={() => setCurrentOrgId('new-id')}>
        Cambiar org
      </button>
    </div>
  )
}
```

## API Route (solo para webhooks)

```tsx
// app/api/webhooks/etpay/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logError } from '@/lib/error-handler'

// Usar Service Role solo en API Routes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // Validar signature/token del webhook
    const signature = request.headers.get('x-etpay-signature')
    if (!validateSignature(signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = await request.json()

    // Procesar webhook
    await supabase
      .from('vouchers')
      .update({ estado: 'PAGADO', fecha_pago: new Date().toISOString() })
      .eq('voucher_id', payload.voucher_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    await logError({
      fuente: 'etpay-webhook',
      error,
      importancia: 'CRITICAL'
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function validateSignature(signature: string | null): boolean {
  // Implementar validación
  return true
}
```

## Error Boundary

```tsx
// components/error-boundary.tsx
'use client'

import { Component, ReactNode } from 'react'
import { logError } from '@/lib/error-handler'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(_: Error): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    logError({
      fuente: 'error-boundary',
      error,
      importancia: 'CRITICAL',
      metadata: { errorInfo }
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 text-red-800 rounded">
          <h2>Algo salió mal</h2>
          <p>El equipo ha sido notificado.</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Intentar de nuevo
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Uso en layout
import { ErrorBoundary } from '@/components/error-boundary'

export default function Layout({ children }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  )
}
```

## Optimistic Updates

```tsx
const updatePropertyMutation = useMutation({
  mutationFn: async (data: UpdatePropertyData) => {
    const { data: updated, error } = await supabase
      .from('propiedades')
      .update(data)
      .eq('propiedad_id', data.propiedad_id)
      .select()
      .single()

    if (error) throw error
    return updated
  },
  onMutate: async (newData) => {
    // Cancelar queries en curso
    await queryClient.cancelQueries({ queryKey: ['properties', organizationId] })

    // Snapshot del valor anterior
    const previousProperties = queryClient.getQueryData(['properties', organizationId])

    // Actualización optimista
    queryClient.setQueryData(['properties', organizationId], (old: any[]) =>
      old.map(p => p.propiedad_id === newData.propiedad_id ? { ...p, ...newData } : p)
    )

    // Retornar contexto con snapshot
    return { previousProperties }
  },
  onError: (err, newData, context) => {
    // Rollback en caso de error
    queryClient.setQueryData(['properties', organizationId], context?.previousProperties)
    toast.error('Error al actualizar propiedad')
    logError({ fuente: 'update-property', error: err })
  },
  onSettled: () => {
    // Re-fetch para asegurar sincronización
    queryClient.invalidateQueries({ queryKey: ['properties', organizationId] })
  }
})
```

## Loading States

```tsx
function PropertyList() {
  const { data, isLoading, isFetching, error } = useQuery({...})

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-800 rounded">
        Error: {error.message}
      </div>
    )
  }

  return (
    <div>
      {isFetching && <div className="text-sm text-muted-foreground">Actualizando...</div>}
      {data?.map(item => <div key={item.id}>{item.name}</div>)}
    </div>
  )
}
```

## Paginación

```tsx
function PaginatedList() {
  const [page, setPage] = useState(0)
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['properties', organizationId, page],
    queryFn: async () => {
      const from = page * pageSize
      const to = from + pageSize - 1

      const { data, error, count } = await supabase
        .from('propiedades')
        .select('*', { count: 'exact' })
        .eq('organizacion_id', organizationId)
        .range(from, to)
        .order('created_at', { ascending: false })

      if (error) throw error
      return { items: data, total: count }
    },
    keepPreviousData: true, // Mantener datos anteriores durante carga
  })

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div>
      {data?.items.map(item => <div key={item.id}>{item.name}</div>)}

      <div className="flex gap-2 mt-4">
        <Button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          Anterior
        </Button>
        <span>Página {page + 1} de {totalPages}</span>
        <Button
          onClick={() => setPage(p => p + 1)}
          disabled={page >= totalPages - 1}
        >
          Siguiente
        </Button>
      </div>
    </div>
  )
}
```

---

**Última actualización**: 2025-12-17
