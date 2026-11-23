"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "@/app/(auth)/actions";
import { Dot, Light } from "@/components/ui/primitives";
import { AuthCard, Field, Notice, SubmitButton } from "./auth-card";

export function RecoveryForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});

  return (
    <AuthCard
      title={
        <>
          <Light>Recuperar</Light>
          <br />
          <strong className="font-extrabold">senha</strong>
          <Dot />
        </>
      }
    >
      {state.sent ? (
        <div className="flex flex-col gap-3">
          <Notice>
            Se este e-mail tiver acesso ao Workspace, enviaremos um link em instantes. Verifique também a caixa de spam. O
            link vale por pouco tempo e só pode ser usado uma vez.
          </Notice>
          <p className="text-sm font-light text-paper/70">
            Não chegou em alguns minutos? Peça a um administrador da agência um <strong className="font-semibold">link de
            nova senha</strong>.
          </p>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-4" noValidate>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <p className="text-sm font-light text-paper/70">Informe o e-mail do seu acesso. Enviaremos um link para criar uma nova senha.</p>
          <Field
            label="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={state.email}
            placeholder="voce@agencia.com.br"
          />
          <SubmitButton pendingText="Enviando…">Enviar link</SubmitButton>
        </form>
      )}
      <Link
        href="/entrar"
        className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-paper/60 uppercase hover:text-paper"
      >
        <ArrowLeft className="size-3.5" /> Voltar ao login
      </Link>
    </AuthCard>
  );
}
