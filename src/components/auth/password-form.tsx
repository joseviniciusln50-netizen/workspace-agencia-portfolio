"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { updatePassword, type FormState } from "@/app/(auth)/actions";
import { Dot, Light } from "@/components/ui/primitives";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { AuthCard, Field, Notice, SubmitButton } from "./auth-card";

/** Definição de senha: após o link de recuperação ou o convite (a sessão vem do link). */
export function PasswordForm() {
  const invite = useSearchParams().get("tipo") === "convite";
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});

  return (
    <AuthCard
      title={
        invite ? (
          <>
            <Light>Boas-vindas ao</Light>
            <br />
            <strong className="font-extrabold">Workspace</strong>
            <Dot />
          </>
        ) : (
          <>
            <Light>Nova</Light>
            <br />
            <strong className="font-extrabold">senha</strong>
            <Dot />
          </>
        )
      }
    >
      <form action={action} className="flex flex-col gap-4" noValidate>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <p className="text-sm font-light text-paper/70">
          {invite ? "Crie a senha do seu acesso." : "Escolha uma nova senha."} Mínimo de {PASSWORD_MIN} caracteres, com letras e
          números.
        </p>
        <Field label="Nova senha" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        <Field label="Repita a senha" name="confirmation" type="password" autoComplete="new-password" required />
        <SubmitButton pendingText="Salvando…">Salvar senha</SubmitButton>
      </form>
    </AuthCard>
  );
}
