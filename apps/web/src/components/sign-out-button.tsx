"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@digit-auth/react";

/** Signs the user out of DigitAuth and returns to the sign-in screen. */
export function SignOutButton() {
  const router = useRouter();
  const { logout } = useAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    try {
      setIsSigningOut(true);
      setError("");

      await logout();

      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Unable to sign out. Please try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {isSigningOut ? "Signing out..." : "Sign out"}
      </button>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
