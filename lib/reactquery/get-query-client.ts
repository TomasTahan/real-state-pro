import {
  isServer,
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Evita refetch inmediato al hidratar en cliente
        staleTime: 60 * 1000,
        // Tiempo que la query permanece en cache
        gcTime: 1000 * 60 * 60 * 24, // 24 horas
        // Configuración de retry
        retry: (failureCount, error: any) => {
          // No reintentar para errores de autenticación o cliente
          if (
            error?.status === 401 ||
            error?.status === 403 ||
            error?.status === 404
          ) {
            return false;
          }
          // Máximo 3 reintentos para otros errores
          return failureCount < 3;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Configuración de red
        networkMode: "online",
        // Refetch en focus y reconexión (optimizados)
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // Configuración global para mutaciones
        retry: 1,
        networkMode: "online",
        // Manejo de errores para mutaciones
        onError: (error: any) => {
          console.error("Mutation error:", error);
        },
      },
      // Permite dehidratar queries 'pending' -> mejor streaming
      dehydrate: {
        shouldDehydrateQuery: (q) =>
          defaultShouldDehydrateQuery(q) || q.state.status === "pending",
        // Importante en Next: no redacts Next server errors
        shouldRedactErrors: () => false,
      },
      // (Opcional) Si usas tipos no-JSON, aquí puedes setear serialize/deserialize
      // hydrate: { deserializeData: ... },
      // dehydrate: { serializeData: ... },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
