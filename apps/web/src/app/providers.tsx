"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@digit-auth/react";

export function Providers({ children }: { children: ReactNode }) {
  const apiUrl = process.env.NEXT_PUBLIC_DIGIT_AUTH_API_URL;
  const publishableKey = process.env.NEXT_PUBLIC_DIGIT_AUTH_PUBLISHABLE_KEY;

  if (!publishableKey) {
    throw new Error("Missing DigitAuth publishable key.");
  }

  return (
    <AuthProvider
      apiUrl={apiUrl}
      publishableKey={publishableKey}
      passwordResetPath="/reset-password"
    >
      {children}
    </AuthProvider>
  );
}
