"use client";

import { ForgotPassword } from "@digit-auth/react";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <ForgotPassword signInUrl="/sign-in" />
      </div>
    </main>
  );
}
