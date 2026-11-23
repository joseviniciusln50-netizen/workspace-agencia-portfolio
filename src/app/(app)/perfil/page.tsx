import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Suspense } from "react";
import { IdentityForm, ProfileHero } from "@/components/profile/profile-editor";
import { Dot, Light, PageHeader, SectionTitle, StatCell, StatGrid } from "@/components/ui/primitives";
import { AccountPanel } from "@/components/views/account-panel";
import { getSessionUser } from "@/lib/auth/session";
import { STATUS_LABEL, type TaskStatus } from "@/lib/mural/model";
import { todayIn } from "@/lib/mural/workload";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Meu perfil" };

/**
 * Meu perfil — área pessoal: cabeçalho (foto, nome, funções), Identidade (editar nome/descrição),
 * Minha atividade (tarefas REAIS) e Minha conta. Mesmo fluxo Supabase de antes (sem 2ª implementação).
 */
export default function PerfilPage() {
  return (
    <>
      <PageHeader
        eyebrow="Sua conta"
        title={
          <>
            <Light>Meu</Light> <strong className="font-extrabold">perfil</strong>
            <Dot />
          </>
        }
      />
      <Suspense fallback={<div className="h-52 animate-pulse rounded-card bg-mist-soft" />}>
        <Profile />
      </Suspense>
    </>
  );
}

async function Profile() {
  const user = await getSessionUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("bio").eq("id", user.id).single(),
    supabase.from("profile_roles").select("role_code").eq("profile_id", user.id),
  ]);
  const bio = (profile?.bio as string | undefined) ?? "";
  const roles = (roleRows ?? []).map((r) => r.role_code as string);

  return (
    <div className="flex flex-col gap-10">
      <ProfileHero roles={roles} bio={bio} />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="flex flex-col gap-10 lg:col-span-7">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-card bg-mist-soft" />}>
            <MyActivity userId={user.id} />
          </Suspense>
          <IdentityForm bio={bio} roles={roles} />
        </div>
        <aside className="lg:col-span-5">
          <div className="lg:sticky lg:top-8">
            <AccountPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}

interface MyTask {
  id: string;
  title: string;
  client: string;
  status: TaskStatus;
  due: string | null;
  updatedAt: string;
}

/** Minha atividade — só dados reais das tarefas em que a pessoa é responsável (leitura com RLS). */
async function MyActivity({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: links } = await supabase.from("task_assignees").select("task_id").eq("profile_id", userId);
  const ids = (links ?? []).map((l) => l.task_id as string);
  const { data } = ids.length
    ? await supabase.from("tasks").select("id, title, client, status, due, updated_at").in("id", ids)
    : { data: [] };
  const tasks: MyTask[] = (data ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    client: (t.client as string) || "Interno",
    status: t.status as TaskStatus,
    due: (t.due as string | null) ?? null,
    updatedAt: t.updated_at as string,
  }));

  const today = todayIn();
  const weekEnd = new Date(Date.parse(`${today}T12:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10);
  const open = tasks.filter((t) => t.status !== "entregue");
  const pending = open.filter((t) => t.status !== "aprovado");
  const overdue = pending.filter((t) => t.due && t.due < today);
  const thisWeek = pending.filter((t) => t.due && t.due >= today && t.due <= weekEnd);
  const next = [...pending].filter((t) => t.due).sort((a, b) => a.due!.localeCompare(b.due!)).slice(0, 3);
  const delivered = tasks
    .filter((t) => t.status === "entregue")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);

  return (
    <section aria-labelledby="atividade">
      <SectionTitle>
        <span id="atividade">Minha atividade</span>
      </SectionTitle>
      <StatGrid className="grid-cols-3">
        <StatCell label="Abertas" value={String(open.length).padStart(2, "0")} />
        <StatCell label="Atrasadas" value={String(overdue.length).padStart(2, "0")} accent={overdue.length > 0} />
        <StatCell label="Na semana" value={String(thisWeek.length).padStart(2, "0")} />
      </StatGrid>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TaskList title="Próximos prazos" empty="Nada com prazo por enquanto." tasks={next} today={today} />
        <TaskList title="Postadas recentemente" empty="Nenhuma postagem registrada ainda." tasks={delivered} today={today} done />
      </div>
    </section>
  );
}

function TaskList({ title, empty, tasks, today, done = false }: { title: string; empty: string; tasks: MyTask[]; today: string; done?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold tracking-[0.18em] text-muted uppercase">{title}</p>
      {tasks.length === 0 ? (
        <p className="rounded-tile border border-dashed border-ink/15 px-4 py-6 text-center text-sm font-light text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-card border border-hairline bg-paper">
          {tasks.map((t) => {
            const late = !done && t.due && t.due < today;
            return (
              <li key={t.id}>
                <Link
                  href={`/tarefas?tarefa=${t.id}`}
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-mist/50 focus-visible:bg-mist/60 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {t.client} · {done ? STATUS_LABEL.entregue : STATUS_LABEL[t.status]}
                      {!done && t.due && (
                        <span className={late ? "font-bold text-brand-text" : undefined}>
                          {" "}
                          · {late ? "atrasada" : new Date(`${t.due}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                        </span>
                      )}
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-ink/25 transition-colors group-hover:text-brand" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
