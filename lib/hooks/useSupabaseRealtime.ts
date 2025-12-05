import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient, QueryKey } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
} from "@supabase/supabase-js";

// ============================================================================
// TYPES
// ============================================================================

type PostgresChangeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

type RealtimePayload<T extends Record<string, any> = Record<string, any>> = RealtimePostgresChangesPayload<T>;

/**
 * Strategy for handling realtime changes
 * - 'invalidate': Invalidates the query, triggering a refetch (simpler, extra request)
 * - 'update': Directly updates the cache with the payload (more efficient, no extra request)
 */
type UpdateStrategy = "invalidate" | "update";

/**
 * Configuration for a single table subscription
 */
interface TableSubscription<T extends Record<string, unknown>> {
  /** Table name to subscribe to */
  table: string;
  /** Schema name (defaults to 'public') */
  schema?: string;
  /** Events to listen to */
  event?: PostgresChangeEvent;
  /** Optional filter (e.g., 'user_id=eq.123') */
  filter?: string;
  /**
   * The query key to invalidate/update when changes occur.
   * Can be a function that receives the payload to generate dynamic keys.
   */
  queryKey: QueryKey | ((payload: RealtimePayload<T>) => QueryKey);
  /**
   * Primary key field name for identifying records (defaults to 'id')
   */
  primaryKey?: keyof T;
  /**
   * Custom handler for updating the cache directly.
   * Only used when strategy is 'update'.
   * If not provided, a default handler will be used.
   */
  onUpdate?: (
    oldData: T[] | undefined,
    payload: RealtimePayload<T>
  ) => T[] | undefined;
}

/**
 * Configuration options for the useSupabaseRealtime hook
 */
interface UseSupabaseRealtimeOptions<T extends Record<string, unknown>> {
  /**
   * Array of table subscriptions to set up.
   * Allows subscribing to multiple tables with a single channel.
   */
  subscriptions: TableSubscription<T>[];
  /**
   * Unique channel name (defaults to auto-generated based on tables)
   */
  channelName?: string;
  /**
   * Strategy for handling changes (defaults to 'invalidate')
   */
  strategy?: UpdateStrategy;
  /**
   * Show toast notifications for connection status changes
   */
  showNotifications?: boolean;
  /**
   * Custom notification messages
   */
  notificationMessages?: {
    connected?: string;
    disconnected?: string;
    error?: string;
  };
  /**
   * Callback when connection status changes
   */
  onConnectionChange?: (isConnected: boolean) => void;
  /**
   * Callback when any realtime event is received
   */
  onRealtimeEvent?: (payload: RealtimePayload<T>) => void;
  /**
   * Whether to reconnect when the tab becomes visible again
   */
  reconnectOnFocus?: boolean;
  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Return type of the useSupabaseRealtime hook
 */
interface UseSupabaseRealtimeReturn {
  /** Whether the realtime connection is active */
  isConnected: boolean;
  /** Current connection status */
  status: "connecting" | "connected" | "disconnected" | "error";
  /** Manually reconnect to the channel */
  reconnect: () => void;
  /** Manually disconnect from the channel */
  disconnect: () => void;
}

// ============================================================================
// DEFAULT UPDATE HANDLERS
// ============================================================================

/**
 * Default handler for updating cache when strategy is 'update'
 */
function defaultUpdateHandler<T extends Record<string, unknown>>(
  oldData: T[] | undefined,
  payload: RealtimePayload<T>,
  primaryKey: keyof T = "id" as keyof T
): T[] | undefined {
  if (!oldData) return oldData;

  const eventType = payload.eventType;

  switch (eventType) {
    case "INSERT": {
      const newRecord = payload.new as T;
      // Check if record already exists (avoid duplicates)
      const exists = oldData.some(
        (item) => item[primaryKey] === newRecord[primaryKey]
      );
      if (exists) {
        // Update existing record instead
        return oldData.map((item) =>
          item[primaryKey] === newRecord[primaryKey] ? newRecord : item
        );
      }
      return [...oldData, newRecord];
    }

    case "UPDATE": {
      const updatedRecord = payload.new as T;
      return oldData.map((item) =>
        item[primaryKey] === updatedRecord[primaryKey] ? updatedRecord : item
      );
    }

    case "DELETE": {
      const deletedRecord = payload.old as Partial<T>;
      return oldData.filter(
        (item) => item[primaryKey] !== deletedRecord[primaryKey]
      );
    }

    default:
      return oldData;
  }
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * A generic hook for subscribing to Supabase Realtime changes
 * with React Query integration.
 *
 * @example
 * // Basic usage with invalidation strategy
 * const { isConnected } = useSupabaseRealtime({
 *   subscriptions: [
 *     { table: 'properties', queryKey: ['properties'] }
 *   ]
 * });
 *
 * @example
 * // With direct cache updates
 * const { isConnected } = useSupabaseRealtime({
 *   subscriptions: [
 *     {
 *       table: 'properties',
 *       queryKey: ['properties'],
 *       primaryKey: 'id'
 *     }
 *   ],
 *   strategy: 'update',
 *   showNotifications: true
 * });
 *
 * @example
 * // Multiple tables with filters
 * const { isConnected } = useSupabaseRealtime({
 *   subscriptions: [
 *     { table: 'properties', queryKey: ['properties'], filter: 'status=eq.active' },
 *     { table: 'leads', queryKey: ['leads'], event: 'INSERT' }
 *   ],
 *   strategy: 'invalidate',
 *   showNotifications: true
 * });
 */
export function useSupabaseRealtime<T extends Record<string, unknown>>(
  options: UseSupabaseRealtimeOptions<T>
): UseSupabaseRealtimeReturn {
  const {
    subscriptions,
    channelName,
    strategy = "invalidate",
    showNotifications = false,
    notificationMessages = {},
    onConnectionChange,
    onRealtimeEvent,
    reconnectOnFocus = true,
    debug = false,
  } = options;

  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected");

  const supabase = createClient();
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const log = useCallback(
    (...args: unknown[]) => {
      if (debug) {
        console.log("[useSupabaseRealtime]", ...args);
      }
    },
    [debug]
  );

  // Generate channel name from subscriptions if not provided
  const resolvedChannelName =
    channelName || `realtime-${subscriptions.map((s) => s.table).join("-")}`;

  // Handle realtime changes
  const handleRealtimeChange = useCallback(
    (payload: RealtimePayload<T>, subscription: TableSubscription<T>) => {
      log("Change received:", payload.eventType, payload);

      // Call the general event callback
      onRealtimeEvent?.(payload);

      // Resolve the query key (can be static or dynamic)
      const queryKey =
        typeof subscription.queryKey === "function"
          ? subscription.queryKey(payload)
          : subscription.queryKey;

      if (strategy === "invalidate") {
        // Simple invalidation - React Query will refetch
        log("Invalidating query:", queryKey);
        queryClient.invalidateQueries({ queryKey });
      } else {
        // Direct cache update
        log("Updating cache directly for:", queryKey);
        const primaryKey = subscription.primaryKey || ("id" as keyof T);
        const updateFn = subscription.onUpdate || defaultUpdateHandler;

        queryClient.setQueryData<T[]>(queryKey, (oldData) =>
          updateFn(oldData, payload, primaryKey)
        );
      }
    },
    [strategy, queryClient, onRealtimeEvent, log]
  );

  // Setup realtime connection
  const setupRealtimeConnection = useCallback(() => {
    if (channelRef.current) {
      log("Channel already exists, skipping setup");
      return;
    }

    log("Setting up realtime connection...");
    setStatus("connecting");

    let channel = supabase.channel(resolvedChannelName);

    // Add all subscriptions to the channel
    for (const subscription of subscriptions) {
      const {
        table,
        schema = "public",
        event = "*",
        filter,
      } = subscription;

      const subscriptionConfig: {
        event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT;
        schema: string;
        table: string;
        filter?: string;
      } = {
        event: event as REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
        schema,
        table,
      };

      if (filter) {
        subscriptionConfig.filter = filter;
      }

      log("Adding subscription:", subscriptionConfig);

      channel = channel.on(
        "postgres_changes",
        subscriptionConfig,
        (payload: RealtimePostgresChangesPayload<T>) =>
          handleRealtimeChange(payload as RealtimePayload<T>, subscription)
      );
    }

    // Subscribe and handle status
    channel.subscribe((status) => {
      log("Subscription status:", status);

      if (status === "SUBSCRIBED") {
        setStatus("connected");
        onConnectionChange?.(true);

        if (showNotifications) {
          toast.success(
            notificationMessages.connected ||
              "Conexión en tiempo real establecida"
          );
        }
      } else if (status === "CLOSED") {
        setStatus("disconnected");
        onConnectionChange?.(false);

        if (showNotifications) {
          toast.error(
            notificationMessages.disconnected ||
              "Conexión en tiempo real cerrada"
          );
        }
      } else if (status === "CHANNEL_ERROR") {
        setStatus("error");
        onConnectionChange?.(false);

        if (showNotifications) {
          toast.error(
            notificationMessages.error ||
              "Error en la conexión en tiempo real"
          );
        }
      }
    });

    channelRef.current = channel;
  }, [
    supabase,
    resolvedChannelName,
    subscriptions,
    handleRealtimeChange,
    showNotifications,
    notificationMessages,
    onConnectionChange,
    log,
  ]);

  // Cleanup function
  const disconnect = useCallback(() => {
    if (channelRef.current) {
      log("Disconnecting channel...");
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setStatus("disconnected");
    }
  }, [supabase, log]);

  // Reconnect function
  const reconnect = useCallback(() => {
    disconnect();
    setupRealtimeConnection();
  }, [disconnect, setupRealtimeConnection]);

  // Setup effect
  useEffect(() => {
    setupRealtimeConnection();

    // Handle visibility change for reconnection
    const handleVisibilityChange = () => {
      if (!document.hidden && reconnectOnFocus) {
        log("Tab visible, checking connection...");
        // If not connected, reconnect
        if (status !== "connected") {
          reconnect();
        } else {
          // Optionally invalidate queries to sync state
          for (const subscription of subscriptions) {
            const queryKey =
              typeof subscription.queryKey === "function"
                ? subscription.queryKey({} as RealtimePayload<T>)
                : subscription.queryKey;
            queryClient.invalidateQueries({ queryKey });
          }
        }
      }
    };

    if (reconnectOnFocus) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      disconnect();
      if (reconnectOnFocus) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [
    setupRealtimeConnection,
    disconnect,
    reconnect,
    reconnectOnFocus,
    status,
    subscriptions,
    queryClient,
    log,
  ]);

  return {
    isConnected: status === "connected",
    status,
    reconnect,
    disconnect,
  };
}

// ============================================================================
// CONVENIENCE HOOKS
// ============================================================================

/**
 * Simplified hook for subscribing to a single table
 */
export function useTableRealtime<T extends Record<string, unknown>>(
  table: string,
  queryKey: QueryKey,
  options?: Omit<UseSupabaseRealtimeOptions<T>, "subscriptions"> & {
    schema?: string;
    event?: PostgresChangeEvent;
    filter?: string;
    primaryKey?: keyof T;
  }
): UseSupabaseRealtimeReturn {
  const { schema, event, filter, primaryKey, ...restOptions } = options || {};

  return useSupabaseRealtime<T>({
    subscriptions: [
      {
        table,
        queryKey,
        schema,
        event,
        filter,
        primaryKey,
      },
    ],
    ...restOptions,
  });
}
