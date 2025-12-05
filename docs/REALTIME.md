# Guía de Supabase Realtime + React Query

Esta guía explica cómo usar la implementación de Supabase Realtime integrada con React Query en esta aplicación.

## Tabla de Contenidos

- [¿Qué es esto?](#qué-es-esto)
- [Instalación y Setup](#instalación-y-setup)
- [Conceptos Básicos](#conceptos-básicos)
- [Uso Rápido](#uso-rápido)
- [Estrategias de Actualización](#estrategias-de-actualización)
- [Ejemplos por Caso de Uso](#ejemplos-por-caso-de-uso)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## ¿Qué es esto?

Un hook de React que conecta **Supabase Realtime** (cambios en tiempo real de la base de datos) con **React Query** (gestión de cache y estado).

### ¿Por qué usar esto?

✅ **Sincronización automática**: Cuando alguien crea/edita/elimina datos, todos los clientes conectados se actualizan automáticamente
✅ **Sin código extra**: No necesitas manejar estados manualmente
✅ **Optimizado**: Puedes elegir si refetch o actualizar el cache directamente
✅ **Tipado completo**: TypeScript de principio a fin
✅ **Flexible**: Múltiples tablas, filtros, eventos específicos, etc.

---

## Instalación y Setup

### 1. Prerequisitos

Esta implementación ya está incluida en el proyecto. Solo necesitas:

```bash
# Estas dependencias ya están instaladas
@supabase/supabase-js
@tanstack/react-query
sonner (para notificaciones)
```

### 2. Configurar Supabase Realtime

Antes de usar el hook, debes habilitar realtime en tus tablas de Supabase:

#### a) En el Dashboard de Supabase

1. Ve a `Database` → `Publications`
2. En la publicación `supabase_realtime`, activa las tablas que quieras monitorear

#### b) Por SQL

```sql
-- Agregar tabla a la publicación de realtime
alter publication supabase_realtime add table properties;
alter publication supabase_realtime add table leads;
```

### 3. Habilitar RLS (Row Level Security)

Para que el realtime respete los permisos por usuario:

```sql
-- Habilitar RLS
alter table properties enable row level security;

-- Política de ejemplo: usuarios solo ven sus propias propiedades
create policy "Users can view their own properties"
  on properties for select
  using (auth.uid() = user_id);
```

---

## Conceptos Básicos

### ¿Cómo funciona?

```
1. Usuario A crea una propiedad → Se guarda en Supabase
2. Supabase detecta el cambio → Envía evento por WebSocket
3. El hook recibe el evento → Actualiza React Query
4. React Query notifica al componente → UI se actualiza automáticamente
```

### Dos estrategias de actualización

| Estrategia | ¿Qué hace? | Ventajas | Desventajas |
|------------|-----------|----------|-------------|
| **`invalidate`** | Invalida la query y React Query hace refetch | Simple, menos código | Request extra al servidor |
| **`update`** | Actualiza el cache directamente con el payload | Más rápido, sin request extra | Más código, puede desincronizar si hay lógica compleja |

---

## Uso Rápido

### Caso más simple: Una tabla, invalidación automática

```tsx
import { useQuery } from '@tanstack/react-query';
import { useSupabaseRealtime } from '@/lib/hooks/useSupabaseRealtime';
import { createClient } from '@/lib/supabase/client';

interface Property {
  id: string;
  title: string;
  price: number;
}

function PropertiesList() {
  const supabase = createClient();

  // 1. Query normal de React Query
  const { data: properties, isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data } = await supabase.from('properties').select('*');
      return data as Property[];
    },
  });

  // 2. Realtime - invalida la query cuando hay cambios
  const { isConnected } = useSupabaseRealtime<Property>({
    subscriptions: [
      {
        table: 'properties',
        queryKey: ['properties']
      }
    ]
  });

  if (isLoading) return <div>Cargando...</div>;

  return (
    <div>
      <p>Estado: {isConnected ? '🟢 En vivo' : '🔴 Offline'}</p>
      {properties?.map(p => (
        <div key={p.id}>{p.title} - ${p.price}</div>
      ))}
    </div>
  );
}
```

**¿Qué pasa cuando se inserta/actualiza/elimina una propiedad?**
1. El hook detecta el cambio
2. Invalida la query `['properties']`
3. React Query hace refetch automáticamente
4. La UI se actualiza

---

## Estrategias de Actualización

### Estrategia 1: `invalidate` (Por defecto, recomendado para empezar)

```tsx
const { isConnected } = useSupabaseRealtime<Property>({
  subscriptions: [
    { table: 'properties', queryKey: ['properties'] }
  ],
  strategy: 'invalidate', // o simplemente omitir (es el default)
});
```

**Flujo:**
```
Cambio en DB → Hook detecta → Invalida query → React Query refetch → UI actualiza
```

**Cuándo usar:**
- ✅ Estás empezando
- ✅ Hay lógica compleja en el `queryFn` (joins, transformaciones)
- ✅ No te importa un request extra

### Estrategia 2: `update` (Optimizada, sin refetch)

```tsx
const { isConnected } = useSupabaseRealtime<Property>({
  subscriptions: [
    {
      table: 'properties',
      queryKey: ['properties'],
      primaryKey: 'id' // Campo para identificar registros
    }
  ],
  strategy: 'update', // Actualiza cache directamente
});
```

**Flujo:**
```
Cambio en DB → Hook detecta → Actualiza cache directamente → UI actualiza
```

**Cuándo usar:**
- ✅ Queries simples (sin joins complejos)
- ✅ Quieres máxima velocidad
- ✅ Reduces carga al servidor

**⚠️ Limitación:** Si tu `queryFn` hace joins o transforma datos, el payload de realtime no tendrá esa información. En ese caso, usa `invalidate`.

---

## Ejemplos por Caso de Uso

### 📌 Caso 1: Lista simple con notificaciones

```tsx
function PropertiesList() {
  const supabase = createClient();

  const { data } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data } = await supabase.from('properties').select('*');
      return data;
    }
  });

  const { isConnected } = useSupabaseRealtime({
    subscriptions: [{ table: 'properties', queryKey: ['properties'] }],
    showNotifications: true, // Muestra toasts de conexión/desconexión
  });

  return <div>{/* ... */}</div>;
}
```

### 📌 Caso 2: Múltiples tablas en un dashboard

```tsx
function Dashboard() {
  const supabase = createClient();

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data } = await supabase.from('properties').select('*');
      return data;
    }
  });

  const { data: leads } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('*');
      return data;
    }
  });

  // Un solo canal para múltiples tablas
  const { isConnected } = useSupabaseRealtime({
    subscriptions: [
      { table: 'properties', queryKey: ['properties'] },
      { table: 'leads', queryKey: ['leads'] }
    ],
    channelName: 'dashboard-realtime',
    showNotifications: true,
  });

  return <div>{/* ... */}</div>;
}
```

### 📌 Caso 3: Filtrar por usuario (solo mis propiedades)

```tsx
function MyProperties({ userId }: { userId: string }) {
  const supabase = createClient();

  const { data } = useQuery({
    queryKey: ['properties', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('properties')
        .select('*')
        .eq('user_id', userId);
      return data;
    }
  });

  // Solo escucha cambios de propiedades de este usuario
  const { isConnected } = useSupabaseRealtime({
    subscriptions: [
      {
        table: 'properties',
        queryKey: ['properties', userId],
        filter: `user_id=eq.${userId}` // Filtro de Supabase
      }
    ],
    strategy: 'update',
  });

  return <div>{/* ... */}</div>;
}
```

### 📌 Caso 4: Solo escuchar inserciones (nuevas propiedades)

```tsx
const { isConnected } = useSupabaseRealtime({
  subscriptions: [
    {
      table: 'properties',
      queryKey: ['properties'],
      event: 'INSERT' // Solo INSERT, no UPDATE ni DELETE
    }
  ]
});
```

### 📌 Caso 5: Hook personalizado (patrón recomendado)

```tsx
// hooks/useProperties.ts
function useProperties(userId?: string) {
  const supabase = createClient();
  const queryKey = ['properties', userId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from('properties').select('*');
      if (userId) q = q.eq('user_id', userId);
      const { data } = await q;
      return data;
    }
  });

  const realtime = useSupabaseRealtime({
    subscriptions: [
      {
        table: 'properties',
        queryKey,
        filter: userId ? `user_id=eq.${userId}` : undefined,
      }
    ],
    strategy: 'update',
  });

  return {
    ...query,
    isRealtimeConnected: realtime.isConnected,
  };
}

// En el componente
function PropertiesScreen() {
  const { data, isLoading, isRealtimeConnected } = useProperties();

  return (
    <div>
      <span>{isRealtimeConnected ? '🟢' : '🔴'}</span>
      {/* ... */}
    </div>
  );
}
```

### 📌 Caso 6: Hook simplificado para una sola tabla

```tsx
import { useTableRealtime } from '@/lib/hooks/useSupabaseRealtime';

function PropertiesList() {
  const { data } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => { /* ... */ }
  });

  // Versión simplificada para una sola tabla
  const { isConnected } = useTableRealtime<Property>(
    'properties',        // nombre de la tabla
    ['properties'],      // query key
    {
      strategy: 'update',
      showNotifications: true
    }
  );

  return <div>{/* ... */}</div>;
}
```

### 📌 Caso 7: Handler personalizado de actualización

```tsx
const { isConnected } = useSupabaseRealtime({
  subscriptions: [
    {
      table: 'properties',
      queryKey: ['properties'],
      // Handler personalizado
      onUpdate: (oldData, payload) => {
        if (!oldData) return oldData;

        if (payload.eventType === 'INSERT') {
          const newProperty = payload.new;
          // Insertar al principio en lugar del final
          return [newProperty, ...oldData];
        }

        if (payload.eventType === 'UPDATE') {
          const updated = payload.new;
          return oldData.map(p => p.id === updated.id ? updated : p);
        }

        if (payload.eventType === 'DELETE') {
          const deleted = payload.old;
          return oldData.filter(p => p.id !== deleted.id);
        }

        return oldData;
      }
    }
  ],
  strategy: 'update',
});
```

### 📌 Caso 8: Con callbacks y debugging

```tsx
const { isConnected, status, reconnect } = useSupabaseRealtime({
  subscriptions: [{ table: 'properties', queryKey: ['properties'] }],
  debug: true, // Logs en consola
  onConnectionChange: (connected) => {
    console.log('Conexión cambió:', connected);
    // Enviar analytics, etc.
  },
  onRealtimeEvent: (payload) => {
    console.log('Evento recibido:', payload.eventType);
    // Mostrar notificación personalizada, etc.
  },
  reconnectOnFocus: true, // Reconecta cuando la pestaña vuelve a estar visible
});
```

---

## API Reference

### `useSupabaseRealtime<T>(options)`

Hook principal para suscribirse a cambios en tiempo real.

#### Opciones (`UseSupabaseRealtimeOptions`)

| Propiedad | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `subscriptions` | `TableSubscription[]` | ✅ Sí | - | Array de suscripciones a tablas |
| `strategy` | `'invalidate' \| 'update'` | No | `'invalidate'` | Estrategia de actualización |
| `channelName` | `string` | No | Auto-generado | Nombre del canal de Supabase |
| `showNotifications` | `boolean` | No | `false` | Mostrar toasts de conexión |
| `notificationMessages` | `object` | No | - | Mensajes personalizados de toasts |
| `onConnectionChange` | `(connected: boolean) => void` | No | - | Callback cuando cambia la conexión |
| `onRealtimeEvent` | `(payload) => void` | No | - | Callback cuando llega un evento |
| `reconnectOnFocus` | `boolean` | No | `true` | Reconectar cuando la pestaña vuelve a estar visible |
| `debug` | `boolean` | No | `false` | Habilitar logs de debug |

#### `TableSubscription<T>`

| Propiedad | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `table` | `string` | ✅ Sí | - | Nombre de la tabla |
| `queryKey` | `QueryKey \| (payload) => QueryKey` | ✅ Sí | - | Query key de React Query a invalidar/actualizar |
| `schema` | `string` | No | `'public'` | Schema de la tabla |
| `event` | `'INSERT' \| 'UPDATE' \| 'DELETE' \| '*'` | No | `'*'` | Eventos a escuchar |
| `filter` | `string` | No | - | Filtro de Supabase (ej: `'user_id=eq.123'`) |
| `primaryKey` | `keyof T` | No | `'id'` | Campo que identifica registros únicos |
| `onUpdate` | `(oldData, payload) => newData` | No | Handler por defecto | Handler personalizado de actualización |

#### Retorno (`UseSupabaseRealtimeReturn`)

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `isConnected` | `boolean` | Si está conectado al realtime |
| `status` | `'connecting' \| 'connected' \| 'disconnected' \| 'error'` | Estado de la conexión |
| `reconnect` | `() => void` | Función para reconectar manualmente |
| `disconnect` | `() => void` | Función para desconectar manualmente |

### `useTableRealtime<T>(table, queryKey, options?)`

Hook simplificado para una sola tabla.

```tsx
const { isConnected } = useTableRealtime<Property>(
  'properties',
  ['properties'],
  { strategy: 'update', showNotifications: true }
);
```

---

## Troubleshooting

### ❌ No se conecta / No recibo cambios

**1. ¿Habilitaste la tabla en Realtime?**

```sql
alter publication supabase_realtime add table tu_tabla;
```

**2. ¿Tienes RLS habilitado y políticas correctas?**

El realtime respeta RLS. Si un usuario no tiene permiso para ver un registro, no recibirá el evento.

```sql
-- Ver políticas actuales
select * from pg_policies where tablename = 'tu_tabla';
```

**3. ¿El filtro es correcto?**

```tsx
filter: 'user_id=eq.123' // ✅ Correcto
filter: 'user_id = 123'   // ❌ Incorrecto (sintaxis de Supabase)
```

**4. Habilita debug:**

```tsx
const { isConnected } = useSupabaseRealtime({
  subscriptions: [...],
  debug: true // Ver logs en consola
});
```

### ❌ El cache no se actualiza correctamente

**Si usas `strategy: 'update'` y tienes joins:**

```tsx
// ❌ Esto NO funcionará bien con strategy: 'update'
const { data } = useQuery({
  queryKey: ['properties'],
  queryFn: async () => {
    const { data } = await supabase
      .from('properties')
      .select('*, owner:users(name)'); // JOIN
    return data;
  }
});

// ✅ Usa 'invalidate' en su lugar
const { isConnected } = useSupabaseRealtime({
  subscriptions: [{ table: 'properties', queryKey: ['properties'] }],
  strategy: 'invalidate' // Hace refetch con el join completo
});
```

### ❌ Múltiples suscripciones al mismo canal

Si el componente se monta/desmonta frecuentemente, puede crear múltiples canales.

**Solución:** Mover el hook a un nivel superior o usar un singleton.

```tsx
// ❌ En un componente que se monta/desmonta
function MyComponent() {
  const { isConnected } = useSupabaseRealtime(...);
}

// ✅ En el layout principal
function RootLayout({ children }) {
  const { isConnected } = useSupabaseRealtime(...);
  return <>{children}</>;
}
```

### ❌ "Channel name cannot be 'realtime'"

```tsx
// ❌ Incorrecto
channelName: 'realtime'

// ✅ Correcto
channelName: 'my-custom-channel'
```

---

## Mejores Prácticas

### ✅ 1. Usa hooks personalizados

Encapsula la lógica en un hook:

```tsx
// ✅ Bueno
function useProperties() {
  const query = useQuery(...);
  const realtime = useSupabaseRealtime(...);
  return { ...query, isRealtimeConnected: realtime.isConnected };
}

// ❌ Malo
function MyComponent() {
  const query = useQuery(...);
  const realtime = useSupabaseRealtime(...);
  // Lógica duplicada en cada componente
}
```

### ✅ 2. Empieza con `invalidate`, optimiza después

```tsx
// Fase 1: Desarrollo - simple
strategy: 'invalidate'

// Fase 2: Optimización - si es necesario
strategy: 'update'
```

### ✅ 3. Usa filtros para reducir eventos

```tsx
// ❌ Recibe todos los cambios, filtra en cliente
subscriptions: [{ table: 'properties', queryKey: ['properties'] }]

// ✅ Solo recibe cambios relevantes
subscriptions: [{
  table: 'properties',
  queryKey: ['properties'],
  filter: `user_id=eq.${userId}`
}]
```

### ✅ 4. Maneja la reconexión

```tsx
const { status, reconnect } = useSupabaseRealtime({
  subscriptions: [...],
  reconnectOnFocus: true, // Auto-reconecta
  onConnectionChange: (connected) => {
    if (!connected) {
      // Mostrar banner de "Sin conexión"
    }
  }
});
```

---

## Recursos Adicionales

- [Documentación oficial de Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [React Query Docs](https://tanstack.com/query/latest)
- Ver ejemplos en: `/lib/hooks/useSupabaseRealtime.example.tsx`

---

## Changelog

### v1.0.0 (2025-12-05)
- Implementación inicial
- Soporte para `invalidate` y `update` strategies
- Integración con React Query
- Soporte para múltiples tablas
- Filtros y eventos específicos
- Notificaciones opcionales
