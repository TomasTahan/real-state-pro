/**
 * EJEMPLOS DE USO DEL HOOK useSupabaseRealtime
 *
 * Este archivo contiene ejemplos de cómo usar el hook en diferentes escenarios.
 * NO es un archivo de producción, es solo documentación.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabaseRealtime, useTableRealtime } from "./useSupabaseRealtime";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// TIPOS DE EJEMPLO
// ============================================================================

interface Property {
  id: string;
  title: string;
  price: number;
  status: "available" | "sold" | "rented";
  user_id: string;
  created_at: string;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  property_id: string;
  created_at: string;
}

// ============================================================================
// EJEMPLO 1: USO BÁSICO - Una tabla con invalidación
// ============================================================================

function PropertiesListBasic() {
  const supabase = createClient();

  // Query normal de React Query
  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Property[];
    },
  });

  // Suscripción a realtime - invalida la query cuando hay cambios
  const { isConnected } = useSupabaseRealtime<Property>({
    subscriptions: [{ table: "properties", queryKey: ["properties"] }],
    showNotifications: true,
  });

  if (isLoading) return <div>Cargando...</div>;

  return (
    <div>
      <p>Estado: {isConnected ? "Conectado" : "Desconectado"}</p>
      {properties?.map((p) => (
        <div key={p.id}>{p.title}</div>
      ))}
    </div>
  );
}

// ============================================================================
// EJEMPLO 2: USO CON HOOK SIMPLIFICADO
// ============================================================================

function PropertiesListSimple() {
  const supabase = createClient();

  const { data: properties } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("*");
      return data as Property[];
    },
  });

  // Hook simplificado para una sola tabla
  const { isConnected } = useTableRealtime<Property>("properties", ["properties"], {
    showNotifications: true,
    strategy: "invalidate",
  });

  return (
    <div>
      <p>{isConnected ? "En vivo" : "Offline"}</p>
      {/* ... */}
    </div>
  );
}

// ============================================================================
// EJEMPLO 3: ACTUALIZACIÓN DIRECTA DEL CACHE (sin refetch)
// ============================================================================

function PropertiesListOptimized() {
  const supabase = createClient();

  const { data: properties } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("*");
      return data as Property[];
    },
  });

  // Usa 'update' para modificar el cache directamente
  const { isConnected } = useSupabaseRealtime<Property>({
    subscriptions: [
      {
        table: "properties",
        queryKey: ["properties"],
        primaryKey: "id", // Campo usado para identificar registros
      },
    ],
    strategy: "update", // Actualiza cache directamente, sin refetch
    showNotifications: true,
  });

  return <div>{/* ... */}</div>;
}

// ============================================================================
// EJEMPLO 4: MÚLTIPLES TABLAS EN UN SOLO CANAL
// ============================================================================

function DashboardWithMultipleTables() {
  const supabase = createClient();

  const { data: properties } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("*");
      return data as Property[];
    },
  });

  const { data: leads } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*");
      return data as Lead[];
    },
  });

  // Una sola suscripción para múltiples tablas
  const { isConnected } = useSupabaseRealtime<Property | Lead>({
    subscriptions: [
      { table: "properties", queryKey: ["properties"] },
      { table: "leads", queryKey: ["leads"], event: "INSERT" }, // Solo inserciones
    ],
    channelName: "dashboard-realtime",
    showNotifications: true,
    notificationMessages: {
      connected: "Dashboard sincronizado en tiempo real",
      disconnected: "Se perdió la conexión del dashboard",
    },
  });

  return <div>{/* ... */}</div>;
}

// ============================================================================
// EJEMPLO 5: CON FILTROS (ej: solo propiedades de un usuario)
// ============================================================================

function UserPropertiesWithFilter({ userId }: { userId: string }) {
  const supabase = createClient();

  const { data: properties } = useQuery({
    queryKey: ["properties", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("*")
        .eq("user_id", userId);
      return data as Property[];
    },
  });

  // Solo escucha cambios de propiedades de este usuario
  const { isConnected } = useSupabaseRealtime<Property>({
    subscriptions: [
      {
        table: "properties",
        queryKey: ["properties", userId],
        filter: `user_id=eq.${userId}`, // Filtro de Supabase
      },
    ],
    strategy: "update",
  });

  return <div>{/* ... */}</div>;
}

// ============================================================================
// EJEMPLO 6: CON QUERY KEY DINÁMICA
// ============================================================================

function PropertiesWithDynamicKey() {
  const supabase = createClient();

  const { data: properties } = useQuery({
    queryKey: ["properties", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("*");
      return data as Property[];
    },
  });

  // Query key dinámica basada en el payload
  const { isConnected } = useSupabaseRealtime<Property>({
    subscriptions: [
      {
        table: "properties",
        // La query key puede depender del payload
        queryKey: (payload) => {
          const record = (payload.new || payload.old) as Property;
          // Invalida tanto la lista general como la específica del usuario
          return ["properties", record?.user_id || "all"];
        },
      },
    ],
  });

  return <div>{/* ... */}</div>;
}

// ============================================================================
// EJEMPLO 7: CON HANDLER PERSONALIZADO DE ACTUALIZACIÓN
// ============================================================================

function PropertiesWithCustomHandler() {
  const supabase = createClient();

  const { data: properties } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("*");
      return data as Property[];
    },
  });

  const { isConnected } = useSupabaseRealtime<Property>({
    subscriptions: [
      {
        table: "properties",
        queryKey: ["properties"],
        // Handler personalizado para actualizar el cache
        onUpdate: (oldData, payload) => {
          if (!oldData) return oldData;

          if (payload.eventType === "INSERT") {
            const newProperty = payload.new as Property;
            // Insertar al principio en lugar del final
            return [newProperty, ...oldData];
          }

          if (payload.eventType === "UPDATE") {
            const updated = payload.new as Property;
            return oldData.map((p) => (p.id === updated.id ? updated : p));
          }

          if (payload.eventType === "DELETE") {
            const deleted = payload.old as Property;
            return oldData.filter((p) => p.id !== deleted.id);
          }

          return oldData;
        },
      },
    ],
    strategy: "update",
  });

  return <div>{/* ... */}</div>;
}

// ============================================================================
// EJEMPLO 8: CON CALLBACKS Y DEBUG
// ============================================================================

function PropertiesWithCallbacks() {
  const { isConnected, status, reconnect, disconnect } =
    useSupabaseRealtime<Property>({
      subscriptions: [{ table: "properties", queryKey: ["properties"] }],
      showNotifications: true,
      debug: true, // Activa logs en consola
      onConnectionChange: (connected) => {
        console.log("Conexión cambió:", connected);
        // Podrías enviar analytics aquí
      },
      onRealtimeEvent: (payload) => {
        console.log("Evento recibido:", payload.eventType, payload.table);
        // Podrías mostrar una notificación específica
      },
      reconnectOnFocus: true, // Reconecta cuando la pestaña vuelve a estar visible
    });

  return (
    <div>
      <p>Estado: {status}</p>
      <button onClick={reconnect}>Reconectar</button>
      <button onClick={disconnect}>Desconectar</button>
    </div>
  );
}

// ============================================================================
// EJEMPLO 9: PATRÓN RECOMENDADO PARA PANTALLAS COMPLEJAS
// ============================================================================

// Hook personalizado que combina la query + realtime
function useProperties(filters?: { userId?: string; status?: string }) {
  const supabase = createClient();
  const queryKey = ["properties", filters];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("properties").select("*");

      if (filters?.userId) {
        q = q.eq("user_id", filters.userId);
      }
      if (filters?.status) {
        q = q.eq("status", filters.status);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as Property[];
    },
  });

  // Construir filtro para realtime
  const realtimeFilter = filters?.userId
    ? `user_id=eq.${filters.userId}`
    : undefined;

  const realtime = useSupabaseRealtime<Property>({
    subscriptions: [
      {
        table: "properties",
        queryKey,
        filter: realtimeFilter,
        primaryKey: "id",
      },
    ],
    strategy: "update",
    showNotifications: false, // Manejamos notificaciones en el componente
  });

  return {
    ...query,
    isRealtimeConnected: realtime.isConnected,
    realtimeStatus: realtime.status,
  };
}

// Uso del hook personalizado
function PropertiesScreen() {
  const { data, isLoading, isRealtimeConnected } = useProperties({
    status: "available",
  });

  return (
    <div>
      <header>
        <span>{isRealtimeConnected ? "En vivo" : "Offline"}</span>
      </header>
      {isLoading ? (
        <p>Cargando...</p>
      ) : (
        data?.map((p) => <div key={p.id}>{p.title}</div>)
      )}
    </div>
  );
}

export {
  PropertiesListBasic,
  PropertiesListSimple,
  PropertiesListOptimized,
  DashboardWithMultipleTables,
  UserPropertiesWithFilter,
  PropertiesWithDynamicKey,
  PropertiesWithCustomHandler,
  PropertiesWithCallbacks,
  useProperties,
  PropertiesScreen,
};
