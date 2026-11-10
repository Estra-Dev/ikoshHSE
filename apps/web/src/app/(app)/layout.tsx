"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@digit-auth/react";
import { SignOutButton } from "@/components/sign-out-button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/employees", label: "Employee Directory" },
  { href: "/employees/me", label: "My Profile" },
  { href: "/departments", label: "Departments" },
] as const;

/**
 * Authenticated application shell. Redirects unauthenticated visitors to the
 * sign-in screen; every page in this group renders behind this guard. All
 * data access still requires a valid IKOSH employee record server-side.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/sign-in");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">Checking authentication...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">Redirecting to sign in...</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <Link
              href="/dashboard"
              className="text-lg font-bold text-zinc-900 dark:text-white"
            >
              IKOSH HSE
            </Link>
            <p className="text-xs text-zinc-500">
              Enterprise HSE Management System
            </p>
          </div>

          <div className="flex items-center gap-4">
            <p className="hidden text-sm text-zinc-600 sm:block dark:text-zinc-400">
              {user?.email}
            </p>
            <SignOutButton />
          </div>
        </div>

        <nav className="border-t border-zinc-100 dark:border-zinc-800/60">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-700 text-white"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
