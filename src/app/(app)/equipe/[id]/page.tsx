import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { RoleChips } from "@/components/ui/role-chips";
import { DueLabel } from "@/components/tasks/due-label";
import { StatusPill } from "@/components/ui/primitives";
import type { TaskStatus } from "@/lib/mural/model";
import { Dot, SectionTitle } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/auth/session";
import { avatarSrc, UUID_RE } from "@/lib/profile/rules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Perfil" };

/** Perfil de um colega (dados REAIS; o RLS só entrega perfis ativos — admins veem também os desativados). */
export default function MemberPage({ params }: PageProps<"/equipe/[id]">) {
  return (
    <>
      <Link
        href="/equipe"
        className="mb-6 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-muted uppercase hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Equipe
      </Link>
      <Suspense fallback={<div className="h-56 animate-pulse rounded-card bg-mist-soft" />}>
        <Member params={params} />
      </Suspense>
    </>
  );
}

async function Member({ params }: { params: PageProps<"/equipe/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const me = await getSessionUser();

  const supabase = await createClient();
  const [{ data: p }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, bio, avatar_url, is_active").eq("id", id).maybeSingle(),
    supabase.from("profile_roles").select("role_code").eq("profile_id", id),
  ]);
  if (!p) notFound();
  const roles = (roleRows ?? []).map((r) => r.role_code as string);

  const name = (p.full_name as string) || "Sem nome";
  const [first, ...rest] = name.split(" ");

  return (
    <article className="max-w-2xl">
      <header className="flex flex-col gap-6 border-b border-hairline pb-8 sm:flex-row sm:items-center">
        <PersonAvatar name={name} src={avatarSrc(p.id, p.avatar_url)} className="size-28 text-3xl" />
        <div className="min-w-0">
          {!p.is_active && (
            <p className="mb-2 inline-block rounded-tile bg-ink px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-paper uppercase">
              Acesso desativado
            </p>
          )}
          <h1 className="text-[2.25rem] leading-[0.95] tracking-tight break-words md:text-5xl">
            <span className="font-extrabold">{first}</span> {rest.length > 0 && <span className="font-light">{rest.join(" ")}</span>}
            <Dot />
          </h1>
          {p.id === me.id && (
            <Link href="/perfil" className="mt-3 inline-block text-[11px] font-bold tracking-wide text-brand-text uppercase hover:underline">
              Editar meu perfil
            </Link>
          )}
        </div>
      </header>

      <section className="mt-8">
        <SectionTitle>Sobre</SectionTitle>
        <p className="text-[15px] leading-relaxed font-light whitespace-pre-line">
          {(p.bio as string) || "Ainda sem descrição."}
        </p>
      </section>

      <section className="mt-10">
        <SectionTitle>Funções profissionais</SectionTitle>
        {roles.length > 0 ? (
          <RoleChips codes={roles} className="mt-0" />
        ) : (
          <p className="text-sm font-light text-muted">Ainda não definidas pela administração.</p>
        )}
      </section>

      <MemberTasks memberId={p.id} />
    </article>
  );
}

/** Tarefas atribuídas (abertas) e histórico de entregas do membro — dados reais do mural. */
async function MemberTasks({ memberId }: { memberId: string }) {
  const supabase = await createClient();
  const { data: links } = await supabase.from("task_assignees").select("task_id").eq("profile_id", memberId);
  const ids = (links ?? []).map((l) => l.task_id as string);
  const { data } = ids.length
    ? await supabase.from("tasks").select("id, title, client, status, due").in("id", ids).order("due", { ascending: true, nullsFirst: false })
    : { data: [] as { id: string; title: string; client: string; status: TaskStatus; due: string | null }[] };
  const all = (data ?? []) as { id: string; title: string; client: string; status: TaskStatus; due: string | null }[];
  const open = all.filter((t) => t.status !== "entregue");
  const delivered = all.length - open.length;

  return (
    <>
      <section className="mt-10">
        <SectionTitle>
          Tarefas abertas <span className="font-light text-muted tabular-nums">({open.length})</span>
        </SectionTitle>
        {open.length === 0 ? (
          <p className="text-sm font-light text-muted">Nenhuma tarefa aberta.</p>
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {open.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{t.title}</span>
                  <span className="block truncate text-xs font-light text-muted">
                    {t.client || "Interno"} · <DueLabel iso={t.due} />
                  </span>
                </span>
                <StatusPill status={t.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-10">
        <SectionTitle>Histórico de postagens</SectionTitle>
        <p className="text-sm font-light text-muted">
          <span className="text-2xl font-light text-ink tabular-nums">{delivered}</span> {delivered === 1 ? "tarefa postada" : "tarefas postadas"}
        </p>
      </section>
    </>
  );
}
