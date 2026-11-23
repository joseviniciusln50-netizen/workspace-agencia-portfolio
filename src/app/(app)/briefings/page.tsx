import type { Metadata } from "next";
import { Suspense } from "react";
import { WithMural } from "@/components/mural/with-mural";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { BriefingsView } from "@/components/views/briefings-view";

export const metadata: Metadata = { title: "Briefings" };

export default function BriefingsPage({ searchParams }: PageProps<"/briefings">) {
  return (
    <WithMural>
      <Suspense fallback={<PageSkeleton />}>
        <Briefings searchParams={searchParams} />
      </Suspense>
    </WithMural>
  );
}

async function Briefings({ searchParams }: { searchParams: PageProps<"/briefings">["searchParams"] }) {
  const { b } = await searchParams;
  // ?b=<id> abre o briefing direto (link a partir da página do cliente)
  return <BriefingsView initialOpenId={typeof b === "string" ? b : null} />;
}
