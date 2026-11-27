"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Statuses that will not succeed on an immediate retry: authorization
 * failures and upstream authentication outages. Retrying them only delays the
 * error message (and, for timeouts, multiplies the wait).
 */
const NON_RETRYABLE_STATUSES = new Set([401, 403, 503, 504]);

function isNonRetryable(error: unknown): boolean {
  if (
    error instanceof Error &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return NON_RETRYABLE_STATUSES.has((error as { status: number }).status);
  }

  return false;
}

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
              // Do not retry authorization failures or authentication
              // outages: the outcome will not change and the user needs the
              // error message instead.
              if (isNonRetryable(error)) {
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
