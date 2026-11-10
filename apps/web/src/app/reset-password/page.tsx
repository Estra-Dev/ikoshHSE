"use client";

import { ResetPassword } from "@digit-auth/react";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="w-full max-w-md">
        <ResetPassword
          signInUrl="/sign-in"
          forgotPasswordUrl="/forgot-password"
        />
      </div>
    </main>
  );
}
