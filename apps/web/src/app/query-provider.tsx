"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Server-state provider for the IKOSH API. Nested inside the existing
 * DigitAuth `<Providers>` so query hooks can access the auth context.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Do not retry authorization failures: the outcome will not
              // change and the user needs the error message instead.
              if (
                error instanceof Error &&
                "status" in error &&
                (error as { status: number }).status === 403
              ) {
                return false;
              }

              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
