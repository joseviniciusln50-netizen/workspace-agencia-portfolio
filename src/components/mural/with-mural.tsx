import { Suspense, type ReactNode } from "react";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { loadMural } from "@/lib/mural/queries";
import { MuralProvider } from "./mural-context";

/**
 * Carrega o mural NO SERVIDOR (sessão + RLS) e entrega às telas cliente.
 * Após cada ação (server action + refresh()), o servidor recarrega e as telas atualizam.
 */
export function WithMural({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MuralLoader>{children}</MuralLoader>
    </Suspense>
  );
}

async function MuralLoader({ children }: { children: ReactNode }) {
  const data = await loadMural();
  return <MuralProvider data={data}>{children}</MuralProvider>;
}
