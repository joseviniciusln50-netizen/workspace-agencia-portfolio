import type { Metadata } from "next";
import { Suspense } from "react";
import { WithMural } from "@/components/mural/with-mural";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { RecordingsView } from "@/components/views/recordings-view";

export const metadata: Metadata = { title: "Gravações" };

export default function GravacoesPage({ searchParams }: PageProps<"/gravacoes">) {
  return (
    <WithMural>
      <Suspense fallback={<PageSkeleton />}>
        <Gravacoes searchParams={searchParams} />
      </Suspense>
    </WithMural>
  );
}

async function Gravacoes({ searchParams }: { searchParams: PageProps<"/gravacoes">["searchParams"] }) {
  const { g } = await searchParams;
  // ?g=<id> abre a gravação direto (link a partir do calendário)
  return <RecordingsView initialOpenId={typeof g === "string" ? g : null} />;
}
