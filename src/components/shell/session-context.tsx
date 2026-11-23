"use client";

import { createContext, use, type ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/access";

const SessionContext = createContext<SessionUser | null>(null);

/** Disponibiliza às telas o usuário já conferido no servidor (dados mínimos, sem tokens). */
export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <SessionContext value={user}>{children}</SessionContext>;
}

export function useSessionUser(): SessionUser {
  const user = use(SessionContext);
  if (!user) throw new Error("useSessionUser precisa estar dentro do AppShell.");
  return user;
}
