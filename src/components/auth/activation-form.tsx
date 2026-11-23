"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useActionState } from "react";
import { activateAccount, type FormState } from "@/app/(auth)/actions";
import { Dot, Light } from "@/components/ui/primitives";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { AuthCard, Field, Notice, SubmitButton } from "./auth-card";

/** Primeiro acesso: o funcionário usa o código recebido do administrador. */
export function ActivationForm() {
  const [state, action] = useActionState<FormState, FormData>(activateAccount, {});

  return (
    <AuthCard
      title={
        <>
          <Light>Ativar minha</Light>
          <br />
          <strong className="font-extrabold">conta</strong>
          <Dot />
        </>
      }
    >
      <form action={action} className="flex flex-col gap-4" noValidate>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <p className="text-sm font-light text-paper/70">Use o código de ativação que você recebeu do administrador.</p>
        <Field
          label="Nome completo"
          name="full_name"
          autoComplete="name"
          required
          maxLength={80}
          placeholder="Ex.: José Vinícius"
          defaultValue={state.name}
          key={`nome-${state.name ?? ""}`}
        />
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
          placeholder="seu e-mail"
        />
        <Field
          label="Código de ativação"
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
          maxLength={12}
          placeholder="XXXX-XXXX"
          defaultValue={state.code}
          key={`codigo-${state.code ?? ""}`}
          className="uppercase tracking-[0.2em]"
        />
        <Field label="Senha" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        <Field label="Confirme a senha" name="confirmation" type="password" autoComplete="new-password" required />
        <p className="-mt-1 text-xs font-light text-paper/50">Mínimo de {PASSWORD_MIN} caracteres, com letras e números.</p>
        <SubmitButton pendingText="Ativando…">Ativar e entrar</SubmitButton>
      </form>
      <Link
        href="/entrar"
        className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-paper/60 uppercase hover:text-paper"
      >
        <ArrowLeft className="size-3.5" /> Já tenho conta
      </Link>
    </AuthCard>
  );
}
