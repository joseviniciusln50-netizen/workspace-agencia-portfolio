"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signIn, type FormState } from "@/app/(auth)/actions";
import { Dot, Light } from "@/components/ui/primitives";
import { loginNotice } from "@/lib/auth/routes";
import { AuthCard, Field, Notice, SubmitButton } from "./auth-card";

export function LoginForm() {
  const params = useSearchParams();
  const notice = loginNotice(params.get("motivo"));
  const [state, action] = useActionState<FormState, FormData>(signIn, {});

  return (
    <AuthCard
      title={
        <>
          <Light>Entrar no</Light>
          <br />
          <strong className="font-extrabold">Workspace</strong>
          <Dot />
        </>
      }
    >
      <form action={action} className="flex flex-col gap-4" noValidate>
        {state.error ? <Notice tone="error">{state.error}</Notice> : notice && <Notice>{notice}</Notice>}
        <input type="hidden" name="next" value={params.get("next") ?? ""} />
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
          key={state.email ?? "email"}
          placeholder="voce@agencia.com.br"
        />
        <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
        <div className="-mt-1 flex justify-end">
          <Link
            href="/recuperar-senha"
            className="text-[11px] font-bold tracking-[0.12em] text-paper/60 uppercase underline-offset-4 hover:text-paper hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>
        <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
      </form>
      <p className="mt-6 border-t border-paper/10 pt-4 text-xs font-light text-paper/50">
        Primeiro acesso?{" "}
        <Link
          href="/ativar"
          className="font-semibold text-paper/80 underline decoration-brand underline-offset-4 hover:text-paper"
        >
          Ativar minha conta
        </Link>
        <span className="mt-1 block">O acesso é liberado por convite de um administrador da agência.</span>
      </p>
    </AuthCard>
  );
}
