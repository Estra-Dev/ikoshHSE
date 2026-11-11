"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@digit-auth/react";
import { ShieldIcon } from "@/components/icons";
import { buttonStyles } from "@/components/ui/feedback";

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
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <p className="text-sm text-muted" role="status">
          Checking authentication...
        </p>
      </main>
    );
  }

  if (isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <p className="text-sm text-muted" role="status">
          Redirecting to dashboard...
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-navy-900 text-white">
          <ShieldIcon size={22} />
        </span>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
          IKOSH HSE
        </h1>

        <p className="mt-2 text-sm leading-6 text-muted">
          Enterprise Health, Safety and Environment Management System.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link href="/sign-in" className={buttonStyles("primary")}>
            Sign in
          </Link>

          <Link href="/sign-up" className={buttonStyles("secondary")}>
            Create an account
          </Link>
        </div>
      </div>
    </main>
  );
}
