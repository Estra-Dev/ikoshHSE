"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@digit-auth/react";

export default function Home() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">Checking authentication...</p>
      </main>
    );
  }

  if (isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500">Redirecting to dashboard...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
          IKOSH HSE
        </h1>

        <p className="mt-3 text-sm text-zinc-500">
          Enterprise Health, Safety and Environment Management System.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/sign-in"
            className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            Sign in
          </Link>

          <Link
            href="/sign-up"
            className="rounded-lg border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Create an account
          </Link>
        </div>
      </div>
    </main>
  );
}
