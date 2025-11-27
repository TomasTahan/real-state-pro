// app/providers.tsx
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/reactquery/get-query-client";
import { QueryErrorBoundary } from "@/lib/reactquery/error-boundary";
import * as React from "react";
import { Toaster } from "sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  // No uses useState aquí (ver guía): evita perder el cliente si Suspense
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <QueryErrorBoundary>
        <Toaster position="bottom-right" duration={3000} richColors />
        {children}
      </QueryErrorBoundary>
    </QueryClientProvider>
  );
}
