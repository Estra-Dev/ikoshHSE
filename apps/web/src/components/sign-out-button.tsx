"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@digit-auth/react";
import { LogOutIcon } from "@/components/icons";
import { buttonStyles } from "@/components/ui/feedback";

type SignOutVariant = "default" | "menu";

/** Signs the user out of DigitAuth and returns to the sign-in screen. */
export function SignOutButton({
  variant = "default",
  className = "",
}: {
  variant?: SignOutVariant;
  className?: string;
}) {
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

  const classes =
    variant === "menu"
      ? `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 ${className}`
      : buttonStyles("secondary", "sm", className);

  return (
    <div
      className={
        variant === "menu" ? "w-full" : "flex flex-col items-end gap-1"
      }
    >
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        aria-busy={isSigningOut || undefined}
        className={classes}
      >
        {variant === "menu" && <LogOutIcon size={16} />}
        <span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
      </button>

      {error && (
        <p className="mt-1 px-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
