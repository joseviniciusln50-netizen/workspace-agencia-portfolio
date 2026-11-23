"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";
import { ACCESS_LABEL, type SessionUser } from "@/lib/auth/access";
import { signOut } from "@/lib/auth/actions";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { cn } from "@/lib/utils";

/** Foto (ou iniciais) do usuário REAL logado. Sem indicador de presença. */
export function UserAvatar({ user, className }: { user: SessionUser; className?: string }) {
  return <PersonAvatar name={user.name} src={user.avatarUrl} className={className} />;
}

export function AccessLabel({ user }: { user: SessionUser }) {
  return <>{ACCESS_LABEL[user.accessLevel]}</>;
}

function SignOutSubmit({ className, label }: { className?: string; label: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Sair do Workspace"
      className={cn("inline-flex items-center gap-2 transition-colors disabled:opacity-60", className)}
    >
      <LogOut className="size-4" strokeWidth={2.2} />
      {label && <span>{pending ? "Saindo…" : "Sair"}</span>}
    </button>
  );
}

export function SignOutButton({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <form action={signOut}>
      <SignOutSubmit className={className} label={label} />
    </form>
  );
}
