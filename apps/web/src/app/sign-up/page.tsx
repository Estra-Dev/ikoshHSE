"use client";

import { SignUp } from "@digit-auth/react";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <SignUp signInUrl="/sign-in" />
      </div>
    </main>
  );
}
