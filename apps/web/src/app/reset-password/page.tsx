"use client";

import { ResetPassword } from "@digit-auth/react";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <ResetPassword
          signInUrl="/sign-in"
          forgotPasswordUrl="/forgot-password"
        />
      </div>
    </main>
  );
}
