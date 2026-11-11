"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@digit-auth/react";
import { ShieldIcon } from "@/components/icons";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Authenticated application shell. Redirects unauthenticated visitors to the
 * sign-in screen; every page in this group renders behind this guard. All
 * data access still requires a valid IKOSH employee record server-side.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/sign-in");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-900 text-white shadow-card">
            <ShieldIcon size={22} />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-navy-900">
              IKOSH HSE
            </p>
            <p className="mt-1 text-sm text-muted" role="status">
              {isLoading
                ? "Checking authentication..."
                : "Redirecting to sign in..."}
            </p>
          </div>
          {isLoading && (
            <span
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-navy-200 border-t-navy-800"
            />
          )}
        </div>
      </main>
    );
  }

  return <AppShell>{children}</AppShell>;
}
