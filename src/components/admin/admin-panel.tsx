"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { Check, Copy, MessageCircle, Settings2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { SectionTitle, StatCell, StatGrid } from "@/components/ui/primitives";
import { RoleChips } from "@/components/ui/role-chips";
import { ACCESS_LABEL, type AccessLevel } from "@/lib/auth/access";
import {
  createInvite,
  generatePasswordResetLink,
  revokeInvite,
  setAccessLevel,
  setActive,
  setRoles,
  transferPrincipal,
  type ActionResult,
  type InviteResult,
  type ResetLinkResult,
} from "@/lib/admin/actions";
import { permissionsFor, PROFESSIONAL_ROLES } from "@/lib/admin/rules";
import { cn } from "@/lib/utils";

export interface AdminMember {
  id: string;
  name: string;
  avatar: string | null;
  level: AccessLevel;
  active: boolean;
  roles: string[];
  email: string | null;
}

export interface AdminInvite {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  /** Calculado no servidor no momento da requisição. */
  expired: boolean;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export function AdminPanel({
  me,
  members,
  invites,
  hasAdminKey,
}: {
  me: { id: string; level: AccessLevel };
  members: AdminMember[];
  invites: AdminInvite[];
  hasAdminKey: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const current = members.find((m) => m.id === editing) ?? null;
  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);
  const admins = active.filter((m) => m.level !== "colaborador").length;
  const openInvites = invites.filter((i) => !i.expired).length;

  return (
    <div className="flex flex-col gap-10">
      {/* Visão geral — números reais */}
      <StatGrid className="grid-cols-2 md:grid-cols-4">
        <StatCell label="Pessoas ativas" value={String(active.length).padStart(2, "0")} />
        <StatCell label="Administradores" value={String(admins).padStart(2, "0")} />
        <StatCell label="Convites" value={String(openInvites).padStart(2, "0")} accent={openInvites > 0} />
        <StatCell label="Desativadas" value={String(inactive.length).padStart(2, "0")} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col gap-10 lg:col-span-7">
          <section aria-labelledby="equipe-admin">
            <SectionTitle>
              <span id="equipe-admin">
                Colaboradores ativos <span className="font-light text-muted tabular-nums">({active.length})</span>
              </span>
            </SectionTitle>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {active.map((m, i) => (
                <MemberCard key={m.id} member={m} isMe={m.id === me.id} index={i} onManage={() => setEditing(m.id)} />
              ))}
            </ul>
          </section>

          {inactive.length > 0 && (
            <section aria-labelledby="desativadas">
              <SectionTitle>
                <span id="desativadas">
                  Contas desativadas <span className="font-light text-muted tabular-nums">({inactive.length})</span>
                </span>
              </SectionTitle>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {inactive.map((m, i) => (
                  <MemberCard key={m.id} member={m} isMe={false} index={i} onManage={() => setEditing(m.id)} />
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* celular: convidar vem antes da lista (ação mais usada); desktop: coluna da direita */}
        <div className="order-first flex flex-col gap-10 lg:order-none lg:col-span-5">
          <InviteSection hasAdminKey={hasAdminKey} />
          <PendingInvites invites={invites} />
          {me.level === "principal" && <TransferSection me={me} members={members} />}
        </div>
      </div>

      <AnimatePresence>
        {current && <MemberSheet key={current.id} member={current} me={me} onClose={() => setEditing(null)} />}
      </AnimatePresence>
    </div>
  );
}

/** Etiqueta do nível: principal em vermelho da marca, admin em preto, colaborador neutro. */
function LevelBadge({ level }: { level: AccessLevel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] whitespace-nowrap uppercase",
        level === "principal" && "bg-brand text-paper",
        level === "admin" && "bg-ink text-paper",
        level === "colaborador" && "bg-mist text-ink/75",
      )}
    >
      {level !== "colaborador" && <ShieldCheck className="size-3" aria-hidden />}
      {/* "Principal" cabe numa linha; o nome completo fica para leitores de tela */}
      {level === "principal" ? (
        <>
          <span aria-hidden>Principal</span>
          <span className="sr-only">{ACCESS_LABEL[level]}</span>
        </>
      ) : (
        ACCESS_LABEL[level]
      )}
    </span>
  );
}

function MemberCard({ member: m, isMe, index, onManage }: { member: AdminMember; isMe: boolean; index: number; onManage: () => void }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(index, 8) * 0.035 }}
      className={cn("flex flex-col rounded-card border border-hairline bg-paper p-4 transition-colors hover:border-ink/25", !m.active && "bg-mist-soft")}
    >
      <div className="flex items-start gap-3">
        <PersonAvatar name={m.name} src={m.avatar} className={cn("size-12", !m.active && "opacity-50 grayscale")} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-semibold">
            {m.name}
            {isMe && <span className="font-light text-muted"> · você</span>}
          </p>
          <p className="mt-0.5 truncate text-xs font-light text-muted">{m.email ?? "—"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <LevelBadge level={m.level} />
            {!m.active && (
              <span className="rounded-full border border-ink/20 px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] uppercase">Desativada</span>
            )}
          </div>
        </div>
      </div>
      <RoleChips codes={m.roles} className="mt-3" />
      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={onManage}
          aria-label={`Gerenciar ${m.name}`}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-tile border border-hairline text-xs font-bold tracking-wide uppercase transition-colors hover:border-ink hover:bg-ink hover:text-paper focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:outline-none"
        >
          <Settings2 className="size-4" /> Gerenciar
        </button>
      </div>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ Convites */

function Submit({ children, pendingText }: { children: ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 shrink-0 rounded-tile bg-ink px-5 text-xs font-bold tracking-wide text-paper uppercase transition-colors hover:bg-graphite disabled:opacity-60"
    >
      {pending ? pendingText : children}
    </button>
  );
}

function InviteSection({ hasAdminKey }: { hasAdminKey: boolean }) {
  const [state, action] = useActionState<InviteResult, FormData>(createInvite, { ok: false });
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!state.message) return;
    try {
      await navigator.clipboard.writeText(state.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="convidar">
      <SectionTitle>
        <span id="convidar">Convidar colaborador</span>
      </SectionTitle>
      <div className="rounded-card border border-hairline bg-paper p-4 md:p-5">
        {!hasAdminKey && (
          <p className="mb-4 flex gap-2 rounded-tile bg-mist-soft p-3 text-xs text-muted">
            <ShieldAlert className="size-4 shrink-0 text-brand-text" />
            A ativação de contas precisa da chave secreta do Supabase no servidor (SUPABASE_SECRET_KEY). Os convites podem ser
            criados, mas ainda não serão aceitos.
          </p>
        )}
        <p className="mb-3 text-xs font-light text-muted">A pessoa recebe um código de uso único, válido por 7 dias, e ativa a conta em /ativar.</p>
        <form action={action} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="invite-email" className="sr-only">
            E-mail do colaborador
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="email@do.colaborador"
            defaultValue={state.ok ? "" : state.email}
            key={state.code ?? state.email ?? "novo"}
            className="h-12 min-w-0 flex-1 rounded-tile border border-hairline bg-paper px-4 text-base outline-none transition-colors focus:border-ink md:text-sm"
          />
          <Submit pendingText="Gerando…">Gerar código</Submit>
        </form>
        {!state.ok && state.error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-brand-text">
            {state.error}
          </p>
        )}
        <AnimatePresence>
          {state.ok && state.code && (
            <motion.div
              key={state.code}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="mt-4 rounded-card bg-ink p-5 text-paper"
            >
              <p className="text-[10px] font-bold tracking-[0.18em] text-paper/60 uppercase">Código para {state.email}</p>
              <p className="mt-2 font-mono text-3xl font-bold tracking-[0.18em] select-all">{state.code}</p>
              <p className="mt-2 text-xs font-light text-paper/60">Mostrado só agora. Vale 7 dias e uma única ativação. Envie por um canal privado.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex h-10 items-center gap-2 rounded-tile bg-paper px-4 text-xs font-bold tracking-wide text-ink uppercase"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copiado" : "Copiar mensagem"}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(state.message ?? "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-tile border border-paper/25 px-4 text-xs font-bold tracking-wide uppercase hover:bg-paper/10"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function PendingInvites({ invites }: { invites: AdminInvite[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-labelledby="pendentes">
      <SectionTitle>
        <span id="pendentes">
          Convites pendentes <span className="font-light text-muted tabular-nums">({invites.length})</span>
        </span>
      </SectionTitle>
      {invites.length === 0 ? (
        <p className="rounded-tile border border-dashed border-ink/15 px-4 py-6 text-center text-sm font-light text-muted">Nenhum convite aguardando ativação.</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-card border border-hairline bg-paper">
          {invites.map((i) => {
            const locked = i.attempts >= 5;
            const problem = i.expired || locked;
            return (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", problem ? "bg-ink/30" : "bg-brand")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.email}</p>
                  <p className="text-xs font-light text-muted">
                    {i.expired ? "Expirado" : locked ? "Bloqueado (5 tentativas erradas)" : `Pendente · vence ${fmtDate(i.expiresAt)}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await revokeInvite(i.id);
                      setError(r.ok ? null : (r.error ?? "Erro."));
                    })
                  }
                  className="h-9 rounded-tile border border-hairline px-3 text-[11px] font-bold tracking-wide uppercase transition-colors hover:border-ink/30 disabled:opacity-60"
                >
                  Cancelar
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-brand-text">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs font-light text-muted">Para reenviar, gere um novo código para o mesmo e-mail (o anterior é cancelado).</p>
    </section>
  );
}

/* ------------------------------------------------------------------ Membro */

function SheetSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-hairline px-5 py-5">
      <h3 className="text-[11px] font-bold tracking-[0.18em] uppercase">{title}</h3>
      {hint && <p className="mt-1 text-xs font-light text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function MemberSheet({ member, me, onClose }: { member: AdminMember; me: { id: string; level: AccessLevel }; onClose: () => void }) {
  const can = permissionsFor(me.level, member.level, member.id === me.id);
  const [roles, setRolesState] = useState<string[]>(member.roles);
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const drag = useDragControls();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function run(fn: () => Promise<ActionResult>, okText: string) {
    setFeedback(null);
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Não foi possível concluir." });
    });
  }

  const rolesChanged = [...roles].sort().join() !== [...member.roles].sort().join();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={`Gerenciar ${member.name}`}>
      <motion.button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        initial={{ y: 48, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 48, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        drag="y"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 500) onClose();
        }}
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] bg-paper shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.5)] md:rounded-card"
      >
        {/* Cabeçalho escuro: quem está sendo gerenciado (alça para arrastar no celular) */}
        <div className="relative shrink-0 overflow-hidden bg-ink px-5 pt-2 pb-5 text-paper">
          <div aria-hidden className="pointer-events-none absolute -top-16 -left-10 size-56 rounded-full bg-[radial-gradient(circle,rgb(255_0_0/0.25),transparent_65%)]" />
          <div onPointerDown={(e) => drag.start(e)} className="mx-auto flex h-6 w-24 cursor-grab touch-none items-center justify-center md:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-paper/30" />
          </div>
          <div className="relative mt-1 flex items-center gap-3 md:mt-3">
            <PersonAvatar name={member.name} src={member.avatar} className="size-14" ringClassName="ring-ink" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg leading-tight font-semibold">{member.name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <LevelBadge level={member.level} />
                <span className="text-xs font-light text-paper/60">{member.active ? "Conta ativa" : "Conta desativada"}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="flex size-10 items-center justify-center rounded-full bg-paper/10 hover:bg-paper/20">
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(max(0.5rem,env(safe-area-inset-bottom))+var(--badge-h))] md:pb-[calc(0.5rem+var(--badge-h))]" style={{ touchAction: "pan-y" }}>
          {/* Funções profissionais */}
          <SheetSection title="Funções profissionais" hint={can.editRoles ? "Selecione uma ou mais." : undefined}>
            <div className="mt-3 flex flex-wrap gap-2">
              {PROFESSIONAL_ROLES.map((r) => {
                const on = roles.includes(r.code);
                return (
                  <motion.button
                    key={r.code}
                    type="button"
                    aria-pressed={on}
                    disabled={!can.editRoles || pending}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setRolesState((cur) => (on ? cur.filter((c) => c !== r.code) : [...cur, r.code]))}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors disabled:opacity-60",
                      on ? "border-ink bg-ink text-paper" : "border-hairline bg-paper hover:border-ink/30",
                    )}
                  >
                    {on && <Check className="size-3.5" />}
                    {r.label}
                  </motion.button>
                );
              })}
            </div>
            {can.editRoles && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!rolesChanged || pending}
                  onClick={() => run(() => setRoles(member.id, roles), "Funções salvas.")}
                  className="h-11 rounded-tile bg-brand px-5 text-xs font-bold tracking-wide text-paper uppercase shadow-[0_10px_22px_-12px_rgb(255_0_0/0.7)] transition-opacity disabled:opacity-40 disabled:shadow-none"
                >
                  {pending && rolesChanged ? "Salvando…" : "Salvar funções"}
                </button>
                <button
                  type="button"
                  disabled={!rolesChanged || pending}
                  onClick={() => setRolesState(member.roles)}
                  className="h-11 rounded-tile border border-hairline px-5 text-xs font-bold tracking-wide uppercase transition-colors hover:border-ink/30 disabled:opacity-40"
                >
                  Cancelar
                </button>
              </div>
            )}
          </SheetSection>

          {/* Nível de acesso — só o principal, nunca em si mesmo */}
          {can.changeLevel && (
            <SheetSection title="Nível de acesso" hint="Administradores convidam, gerenciam funções e desativam colaboradores.">
              <div className="mt-3 inline-flex rounded-tile border border-hairline p-1">
                {(["colaborador", "admin"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    disabled={pending || member.level === lvl}
                    onClick={() => run(() => setAccessLevel(member.id, lvl), lvl === "admin" ? "Agora é administrador." : "Agora é colaborador.")}
                    className={cn(
                      "h-10 rounded-[4px] px-4 text-xs font-bold transition-colors",
                      member.level === lvl ? "bg-ink text-paper" : "text-muted hover:text-ink",
                    )}
                  >
                    {ACCESS_LABEL[lvl]}
                  </button>
                ))}
              </div>
            </SheetSection>
          )}

          {/* Ativar / desativar — confirmação em 2 passos preservada */}
          {can.toggleActive && (
            <SheetSection
              title="Acesso"
              hint={member.active ? "Desativar bloqueia o login imediatamente. O histórico de tarefas é preservado." : "Reativar libera o login novamente."}
            >
              {member.active && !confirmDeactivate ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeactivate(true)}
                  className="mt-3 h-11 rounded-tile border border-hairline px-5 text-xs font-bold tracking-wide uppercase transition-colors hover:border-brand hover:text-brand-text"
                >
                  Desativar acesso
                </button>
              ) : (
                <div className={cn("mt-3 flex flex-wrap gap-2", member.active && "rounded-tile border border-brand/40 bg-brand/[0.04] p-3")}>
                  {member.active && <p className="w-full text-xs font-semibold text-brand-text">Tem certeza? {member.name} não conseguirá mais entrar.</p>}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setActive(member.id, !member.active), member.active ? "Acesso desativado." : "Acesso reativado.")}
                    className={cn("h-11 rounded-tile px-5 text-xs font-bold tracking-wide uppercase disabled:opacity-60", member.active ? "bg-brand text-paper" : "bg-ink text-paper")}
                  >
                    {member.active ? "Confirmar desativação" : "Reativar acesso"}
                  </button>
                  {member.active && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeactivate(false)}
                      className="h-11 rounded-tile border border-hairline bg-paper px-5 text-xs font-bold tracking-wide uppercase"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              )}
            </SheetSection>
          )}

          {can.resetPassword && member.active && <ResetPasswordSection member={member} />}

          {!can.changeLevel && !can.toggleActive && (
            <p className="border-t border-hairline px-5 py-5 text-xs font-light text-muted">
              {member.id === me.id
                ? "Você não pode alterar o próprio nível nem desativar o próprio acesso."
                : member.level === "principal"
                  ? "O administrador principal só muda por transferência da função."
                  : "Seu nível permite gerenciar apenas as funções profissionais desta pessoa."}
            </p>
          )}

          <AnimatePresence>
            {feedback && (
              <motion.p
                key={feedback.text}
                role={feedback.ok ? "status" : "alert"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "mx-5 mb-5 flex items-center gap-2 rounded-tile px-3.5 py-3 text-sm font-semibold",
                  feedback.ok ? "bg-ink text-paper" : "border border-brand/40 bg-brand/[0.05] text-brand-text",
                )}
              >
                {feedback.ok ? <Check className="size-4 text-brand" /> : <ShieldAlert className="size-4" />}
                {feedback.text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ Nova senha (sem SMTP) */

function ResetPasswordSection({ member }: { member: AdminMember }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ResetLinkResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!result?.message) return;
    try {
      await navigator.clipboard.writeText(result.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="border-t border-hairline px-5 py-5">
      <h3 className="text-[11px] font-bold tracking-[0.18em] uppercase">Senha</h3>
      <p className="mt-1 text-xs font-light text-muted">
        Esqueceu a senha? Gere um link e envie por um canal privado. Vale cerca de 1 hora e uma única vez.
      </p>
      {!result?.ok ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setResult(await generatePasswordResetLink(member.id)))}
          className="mt-3 h-11 rounded-tile border border-hairline px-5 text-xs font-bold tracking-wide uppercase hover:border-ink/30 disabled:opacity-60"
        >
          {pending ? "Gerando…" : "Gerar link de nova senha"}
        </button>
      ) : (
        <div className="mt-3 rounded-card bg-ink p-4 text-paper">
          <p className="text-[10px] font-bold tracking-[0.18em] text-paper/60 uppercase">Link para {member.name}</p>
          <p className="mt-2 font-mono text-[11px] break-all text-paper/80 select-all">{result.link}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-10 items-center gap-2 rounded-tile bg-paper px-4 text-xs font-bold tracking-wide text-ink uppercase"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copiado" : "Copiar mensagem"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(result.message ?? "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-tile border border-paper/25 px-4 text-xs font-bold tracking-wide uppercase hover:bg-paper/10"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          </div>
        </div>
      )}
      {result && !result.ok && (
        <p role="alert" className="mt-3 text-sm font-semibold text-brand-text">
          {result.error}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ Transferência */

function TransferSection({ me, members }: { me: { id: string }; members: AdminMember[] }) {
  const [state, action] = useActionState<ActionResult, FormData>(transferPrincipal, { ok: false });
  const candidates = members.filter((m) => m.id !== me.id && m.active);

  return (
    <section aria-labelledby="transferir">
      <SectionTitle>
        <span id="transferir">Zona sensível</span>
      </SectionTitle>
      <div className="rounded-card border border-brand/35 bg-paper p-4 md:p-5">
      <p className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="size-4 text-brand-text" /> Transferir função de principal</p>
      <p className="mt-1 text-sm font-light text-muted">
        Passa o controle total para outra pessoa. Você vira administrador. Exige confirmar sua senha.
      </p>
      {candidates.length === 0 ? (
        <p className="mt-3 text-xs font-light text-muted">Não há outro membro ativo para receber a função.</p>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-3 sm:max-w-md">
          <select
            name="target"
            required
            defaultValue=""
            className="h-12 rounded-tile border border-hairline bg-paper px-3 text-base"
          >
            <option value="" disabled>
              Escolha a pessoa
            </option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Sua senha"
            className="h-12 rounded-tile border border-hairline bg-paper px-4 text-base"
          />
          <Submit pendingText="Transferindo…">Transferir função</Submit>
          {state.error && (
            <p role="alert" className="text-sm font-semibold text-brand-text">
              {state.error}
            </p>
          )}
          {state.ok && <p role="status" className="text-sm font-semibold">Função transferida.</p>}
        </form>
      )}
      </div>
    </section>
  );
}
