# Quick Start - Supabase Realtime

Guía rápida para implementar realtime en 5 minutos.

## 🚀 Paso 1: Habilitar Realtime en Supabase

### Opción A: Dashboard

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. `Database` → `Publications`
3. En `supabase_realtime`, activa tus tablas

### Opción B: SQL

```sql
alter publication supabase_realtime add table properties;
alter publication supabase_realtime add table leads;
```

## 🚀 Paso 2: Configurar RLS (Row Level Security)

```sql
-- Habilitar RLS en tu tabla
alter table properties enable row level security;

-- Permitir que usuarios lean sus propias propiedades
create policy "Users can view their own properties"
  on properties for select
  using (auth.uid() = user_id);
```

## 🚀 Paso 3: Implementar en tu componente

### Ejemplo: Lista de propiedades con actualización en tiempo real

```tsx
import { useQuery } from '@tanstack/react-query';
import { useSupabaseRealtime } from '@/lib/hooks/useSupabaseRealtime';
import { createClient } from '@/lib/supabase/client';

interface Property {
  id: string;
  title: string;
  price: number;
  status: string;
}

function PropertiesList() {
  const supabase = createClient();

  // 1. React Query - carga inicial
  const { data: properties, isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Property[];
    },
  });

  // 2. Realtime - mantiene sincronizado
  const { isConnected } = useSupabaseRealtime<Property>({
    subscriptions: [
      {
        table: 'properties',
        queryKey: ['properties'],
      }
    ],
    showNotifications: true, // Muestra "Conectado" / "Desconectado"
  });

  if (isLoading) return <div>Cargando...</div>;

  return (
    <div>
      <header>
        <h1>Propiedades</h1>
        <span className={isConnected ? 'text-green-500' : 'text-red-500'}>
          {isConnected ? '🟢 En vivo' : '🔴 Offline'}
        </span>
      </header>

      <div className="grid gap-4">
        {properties?.map((property) => (
          <div key={property.id} className="border p-4 rounded">
            <h2>{property.title}</h2>
            <p>${property.price.toLocaleString()}</p>
            <span className="badge">{property.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PropertiesList;
```

## ✅ ¡Listo!

Ahora cuando alguien:
- **Cree** una propiedad → Aparecerá automáticamente en la lista
- **Edite** una propiedad → Se actualizará en tiempo real
- **Elimine** una propiedad → Desaparecerá de la lista

---

## 🎯 Siguientes Pasos

### Optimizar para producción

**Cambiar a estrategia `update` (sin refetch):**

```tsx
const { isConnected } = useSupabaseRealtime<Property>({
  subscriptions: [
    {
      table: 'properties',
      queryKey: ['properties'],
      primaryKey: 'id', // ← Campo que identifica cada registro
    }
  ],
  strategy: 'update', // ← Actualiza cache directamente
  showNotifications: true,
});
```

### Filtrar cambios (solo mis propiedades)

```tsx
const { isConnected } = useSupabaseRealtime<Property>({
  subscriptions: [
    {
      table: 'properties',
      queryKey: ['properties', userId],
      filter: `user_id=eq.${userId}`, // ← Solo cambios de este usuario
    }
  ],
});
```

### Crear hook personalizado

```tsx
// hooks/useProperties.ts
export function useProperties(userId?: string) {
  const supabase = createClient();
  const queryKey = ['properties', userId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from('properties').select('*');
      if (userId) q = q.eq('user_id', userId);
      const { data } = await q;
      return data as Property[];
    },
  });

  const realtime = useSupabaseRealtime<Property>({
    subscriptions: [
      {
        table: 'properties',
        queryKey,
        filter: userId ? `user_id=eq.${userId}` : undefined,
        primaryKey: 'id',
      }
    ],
    strategy: 'update',
  });

  return {
    ...query,
    isRealtimeConnected: realtime.isConnected,
  };
}

// En tu componente
function PropertiesScreen() {
  const { data, isLoading, isRealtimeConnected } = useProperties();
  // ...
}
```

---

## 📚 Más información

Ver documentación completa en: [`docs/REALTIME.md`](./REALTIME.md)
