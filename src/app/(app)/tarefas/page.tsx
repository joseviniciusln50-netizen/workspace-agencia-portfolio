import type { Metadata } from "next";
import { Suspense } from "react";
import { WithMural } from "@/components/mural/with-mural";
import { PageSkeleton } from "@/components/shell/page-skeleton";
import { BoardView, type BoardTab } from "@/components/views/board-view";

export const metadata: Metadata = { title: "Tarefas" };

const TABS: BoardTab[] = ["quadro", "calendario", "postits", "checklists"];

export default function TarefasPage({ searchParams }: PageProps<"/tarefas">) {
  return (
    <WithMural>
      <Suspense fallback={<PageSkeleton />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </WithMural>
  );
}

async function Board({ searchParams }: { searchParams: PageProps<"/tarefas">["searchParams"] }) {
  const { view, tarefa } = await searchParams;
  const tab = TABS.find((t) => t === view) ?? "quadro";
  // ?tarefa=<id> abre a tarefa direto (links compartilhados)
  return <BoardView key={`${tab}:${typeof tarefa === "string" ? tarefa : ""}`} initialTab={tab} initialOpenId={typeof tarefa === "string" ? tarefa : null} />;
}
