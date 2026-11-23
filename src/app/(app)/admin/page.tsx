import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPanel, type AdminInvite, type AdminMember } from "@/components/admin/admin-panel";
import { Accent, Dot, Light, PageHeader } from "@/components/ui/primitives";
import type { AccessLevel } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/session";
import { avatarSrc } from "@/lib/profile/rules";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Administração" };

/**
 * Administração — só para administradores (conferido NO SERVIDOR; para os demais a página
 * "não existe"). Leitura via RLS (o banco só entrega convites e contas desativadas a admins);
 * e-mails das contas vêm do Auth com a chave secreta, DEPOIS de conferir o nível.
 */
export default function AdminPage() {
  return (
    <>
      <PageHeader
        eyebrow="Acesso restrito"
        title={
          <>
            <Light>Painel de</Light> <Accent>administração</Accent>
            <Dot />
          </>
        }
      />
      <Suspense fallback={<div className="h-72 animate-pulse rounded-card bg-mist-soft" />}>
        <AdminData />
      </Suspense>
    </>
  );
}

const LEVEL_ORDER: Record<AccessLevel, number> = { principal: 0, admin: 1, colaborador: 2 };

/** Avaliado no servidor, no momento da requisição (a sessão já foi lida). */
function isExpired(iso: string): boolean {
  return Date.parse(iso) < Date.now();
}

async function AdminData() {
  const me = await getSessionUser();
  if (me.accessLevel !== "principal" && me.accessLevel !== "admin") notFound();

  const supabase = await createClient();
  const [profiles, roles, invites] = await Promise.all([
    supabase.from("profiles").select("id, full_name, avatar_url, access_level, is_active, created_at"),
    supabase.from("profile_roles").select("profile_id, role_code"),
    supabase
      .from("activation_invites")
      .select("id, email, created_at, expires_at, attempts")
      .is("used_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (profiles.error) {
    return <p className="text-sm font-light text-muted">Não foi possível carregar a administração agora.</p>;
  }

  // E-mails de login: só aqui (admins), via chave secreta.
  const emails = new Map<string, string>();
  if (hasAdminKey()) {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
    for (const u of data?.users ?? []) if (u.email) emails.set(u.id, u.email);
  }

  const rolesBy = new Map<string, string[]>();
  for (const r of roles.data ?? []) rolesBy.set(r.profile_id, [...(rolesBy.get(r.profile_id) ?? []), r.role_code]);

  const members: AdminMember[] = (profiles.data ?? [])
    .map((p) => ({
      id: p.id as string,
      name: (p.full_name as string) || "Sem nome",
      avatar: avatarSrc(p.id as string, p.avatar_url as string | null),
      level: p.access_level as AccessLevel,
      active: p.is_active as boolean,
      roles: rolesBy.get(p.id as string) ?? [],
      email: emails.get(p.id as string) ?? null,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.name.localeCompare(b.name, "pt-BR"));

  const pending: AdminInvite[] = (invites.data ?? []).map((i) => ({
    id: i.id as string,
    email: i.email as string,
    createdAt: i.created_at as string,
    expiresAt: i.expires_at as string,
    attempts: i.attempts as number,
    expired: isExpired(i.expires_at as string),
  }));

  return <AdminPanel me={{ id: me.id, level: me.accessLevel }} members={members} invites={pending} hasAdminKey={hasAdminKey()} />;
}
