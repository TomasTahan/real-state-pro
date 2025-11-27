"use client";

import React from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";

interface QueryErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function QueryErrorFallback({
  error,
  resetErrorBoundary,
}: QueryErrorFallbackProps) {
  return (
    <div className="flex min-h-[400px] w-full flex-col items-center justify-center space-y-4 rounded-lg border border-destructive/50 bg-destructive/5 p-8">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold text-destructive">
          Algo salió mal
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Ocurrió un error al cargar los datos. Por favor, inténtalo nuevamente.
        </p>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-sm font-medium">
              Detalles del error (desarrollo)
            </summary>
            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
              {error.message}
            </pre>
          </details>
        )}
      </div>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
}

interface QueryErrorBoundaryProps {
  children: React.ReactNode;
}

export function QueryErrorBoundary({ children }: QueryErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          FallbackComponent={QueryErrorFallback}
          onReset={reset}
          onError={(error, errorInfo) => {
            // Log error en producción (puedes integrar con Sentry, LogRocket, etc.)
            console.error("Query Error Boundary:", error, errorInfo);
          }}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
