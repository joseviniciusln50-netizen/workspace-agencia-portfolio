import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCardFallback } from "@/components/auth/auth-card";
import { PasswordForm } from "@/components/auth/password-form";

export const metadata: Metadata = { title: "Definir senha" };

/** Exige sessão (vinda do link do e-mail): o proxy manda para /entrar se não houver. */
export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={<AuthCardFallback />}>
      <PasswordForm />
    </Suspense>
  );
}
