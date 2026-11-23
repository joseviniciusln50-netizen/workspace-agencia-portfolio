import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellFallback } from "@/components/shell/shell-fallback";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Área PRIVADA do Workspace. A identidade é conferida no servidor antes de renderizar.
 * Com Cache Components, a leitura da sessão (cookies) precisa ficar dentro de <Suspense>.
 * Aviso esperado no modo dev: "Could not validate … instant navigation" (as páginas esperam a sessão).
 */
export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

async function AuthenticatedShell({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return <AppShell user={user}>{children}</AppShell>;
}
