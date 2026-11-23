import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCardFallback } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function EntrarPage() {
  return (
    <Suspense fallback={<AuthCardFallback />}>
      <LoginForm />
    </Suspense>
  );
}
