import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Suspense } from "react";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { RoleChips } from "@/components/ui/role-chips";
import { SloganNegative } from "@/components/brand/logo";
import { PageHero } from "@/components/ui/page-hero";
import { Accent, Dot, Light } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/auth/session";
import { avatarSrc } from "@/lib/profile/rules";
import type { TaskStatus } from "@/lib/mural/model";
import { EMPTY_WORKLOAD, todayIn, workloadByPerson, type Workload } from "@/lib/mural/workload";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Equipe" };

/** Equipe — pessoas REAIS (perfis ativos; leitura limitada pelo RLS). Sem e-mail e sem presença fictícia. */
export default function EquipePage() {
  return (
    <>
      <PageHero
        tone="ink"
        eyebrow="Agência"
        title={
          <>
            <Light>Nossa</Light> <Accent>equipe</Accent>
            <Dot />
          </>
        }
        aside={
          <div className="flex md:justify-end">
            <SloganNegative className="h-16 md:h-20" />
          </div>
        }
      >
        <p className="max-w-md text-[15px] leading-relaxed font-light text-paper/70 md:text-base">
          Quem faz a agência acontecer: funções de cada um e as tarefas abertas, para distribuir o trabalho com equilíbrio.
        </p>
      </PageHero>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-card bg-mist-soft" />}>
        <TeamList />
      </Suspense>
    </>
  );
}

async function TeamList() {
  const me = await getSessionUser();
  const supabase = await createClient();
  const [{ data, error }, { data: roleRows }, { data: taskRows }, { data: assigneeRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, bio, avatar_url").eq("is_active", true).order("full_name", { ascending: true }),
    supabase.from("profile_roles").select("profile_id, role_code"),
    supabase.from("tasks").select("id, status, due").neq("status", "entregue"),
    supabase.from("task_assignees").select("task_id, profile_id"),
  ]);
  const load = workloadByPerson(
    (taskRows ?? []).map((t) => ({ id: t.id as string, status: t.status as TaskStatus, due: (t.due as string | null) ?? null })),
    (assigneeRows ?? []) as { task_id: string; profile_id: string }[],
    todayIn(),
  );

  if (error) return <p className="text-sm font-light text-muted">Não foi possível carregar a equipe agora.</p>;
  const people = data ?? [];
  const rolesBy = new Map<string, string[]>();
  for (const r of roleRows ?? []) rolesBy.set(r.profile_id, [...(rolesBy.get(r.profile_id) ?? []), r.role_code]);

  return (
    <>
      <p className="mb-4 text-[11px] font-bold tracking-[0.18em] text-muted uppercase">
        <span className="text-ink tabular-nums">{people.length}</span> {people.length === 1 ? "pessoa" : "pessoas"}
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
        {people.map((p) => {
          const w = load.get(p.id) ?? EMPTY_WORKLOAD;
          const isMe = p.id === me.id;
          return (
            <li key={p.id}>
              <Link
                href={`/equipe/${p.id}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-card border border-hairline bg-paper transition-colors hover:border-ink/30"
              >
                {isMe && <span aria-hidden className="absolute top-0 left-5 h-[3px] w-10 bg-brand" />}
                <span className="flex items-start gap-4 p-4 md:p-5">
                  <PersonAvatar name={p.full_name || "?"} src={avatarSrc(p.id, p.avatar_url)} className="size-16 text-lg" />
                  <span className="min-w-0 flex-1 pt-1">
                    <span className="block truncate text-base font-semibold">
                      {p.full_name || "Sem nome"}
                      {isMe && <span className="font-light text-muted"> · você</span>}
                    </span>
                    <RoleChips codes={rolesBy.get(p.id) ?? []} />
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-ink/30 transition-colors group-hover:text-brand" />
                </span>
                <span className="line-clamp-2 px-4 pb-4 text-xs leading-relaxed font-light text-muted md:px-5">{p.bio || "Sem descrição ainda."}</span>
                <WorkloadStrip w={w} />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Carga de trabalho em números (dados reais do mural): abertas · atrasadas. */
function WorkloadStrip({ w }: { w: Workload }) {
  return (
    <span className="mt-auto grid grid-cols-2 border-t border-hairline">
      <span className="px-4 py-3 md:px-5">
        <span className="block truncate text-[10px] font-bold tracking-[0.08em] whitespace-nowrap text-muted uppercase">Abertas</span>
        <span className="mt-0.5 block text-2xl leading-none font-light tabular-nums">{w.open}</span>
      </span>
      <span className="border-l border-hairline px-4 py-3 md:px-5">
        <span className="block truncate text-[10px] font-bold tracking-[0.08em] whitespace-nowrap text-muted uppercase">Atrasadas</span>
        <span className={`mt-0.5 block text-2xl leading-none font-light tabular-nums ${w.overdue > 0 ? "text-brand-text" : "text-ink/35"}`}>{w.overdue}</span>
      </span>
    </span>
  );
}
