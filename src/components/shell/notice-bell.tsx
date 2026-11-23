"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { PushToggle } from "@/components/push/push-toggle";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { Sheet } from "@/components/ui/sheet";
import { getNotices, markNoticesSeen, type NoticesPayload } from "@/lib/mural/notice-actions";
import { isUnread, timeAgo, unreadCount } from "@/lib/mural/notifications";
import { cn } from "@/lib/utils";

const POLL_MS = 90_000;

interface NoticesCtx {
  data: NoticesPayload | null;
  seenAt: string | null;
  unread: number;
  markSeen: () => void;
}
const Ctx = createContext<NoticesCtx | null>(null);

/**
 * Centro de avisos ÚNICO da sessão (o shell tem dois sininhos — topo no celular e barra lateral no
 * desktop — e eles compartilham dados e "visto": uma busca só, e abrir um zera os dois).
 * Atualiza ao montar, ao voltar para a aba e a cada 90 s com a aba visível.
 */
export function NoticesProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<NoticesPayload | null>(null);
  const [localSeen, setLocalSeen] = useState<string | null>(null);

  useEffect(() => {
    // Trava POR MONTAGEM (não useRef): no modo estrito o React monta duas vezes; com uma trava
    // compartilhada, a 2ª montagem desistia enquanto a resposta da 1ª era descartada.
    let alive = true;
    let busy = false;
    const load = (force = false) => {
      if (busy || (!force && document.visibilityState !== "visible")) return;
      busy = true;
      getNotices()
        .then((d) => alive && setData(d))
        .catch(() => {
          /* sem rede ou sessão expirada: tenta de novo no próximo ciclo */
        })
        .finally(() => {
          busy = false;
        });
    };
    load(true); // a 1ª busca não depende de a aba estar "visível"
    const poll = () => load();
    const timer = window.setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("focus", poll);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("focus", poll);
    };
  }, []);

  // "Visto" mais recente entre o do servidor e o gravado aqui: uma resposta atrasada do
  // servidor (com o "visto" antigo) não pode trazer o contador de volta.
  const seenAt = [data?.seenAt ?? null, localSeen].reduce<string | null>((a, b) => (!a ? b : !b ? a : a > b ? a : b), null);
  const unread = data ? unreadCount(data.notices, seenAt) : 0;

  const markSeen = () => {
    // sempre grava (mesmo se os avisos ainda estiverem chegando): abrir = ver
    void markNoticesSeen().then((r) => {
      if (r.ok && r.seenAt) setLocalSeen(r.seenAt);
    });
  };

  return <Ctx value={{ data, seenAt, unread, markSeen }}>{children}</Ctx>;
}

/** Sininho de avisos (o que outras pessoas fizeram nas MINHAS tarefas e gravações em que me colocaram). Ao abrir, marca como visto (no banco). */
export function NoticeBell({ className }: { className?: string }) {
  const ctx = use(Ctx);
  if (!ctx) throw new Error("NoticeBell precisa estar dentro de <NoticesProvider>.");
  const { data, seenAt, unread, markSeen } = ctx;
  const [open, setOpen] = useState(false);
  /** "visto" de ANTES de abrir: mantém o destaque do que era novo enquanto o painel está aberto. */
  const [highlightSince, setHighlightSince] = useState<string | null>(null);

  function openPanel() {
    setHighlightSince(seenAt);
    setOpen(true);
    markSeen();
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-haspopup="dialog"
        data-loaded={data ? "1" : "0"}
        aria-label={unread > 0 ? `Avisos: ${unread} ${unread === 1 ? "novo" : "novos"}` : "Avisos"}
        className={cn("relative grid size-9 place-items-center rounded-full text-paper/80 transition-colors hover:bg-paper/10 hover:text-paper", className)}
      >
        <Bell className="size-5" strokeWidth={2.1} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] leading-none font-bold text-paper tabular-nums ring-2 ring-ink"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} eyebrow="Tarefas e gravações" title="Avisos">
        <div className="mb-4">
          <PushToggle compact />
        </div>
        {!data || data.notices.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-lg">
              <span className="font-light">Nada novo</span> <strong className="font-extrabold">por aqui</strong>
              <span className="text-brand">.</span>
            </p>
            <p className="mx-auto mt-2 max-w-xs text-sm font-light text-muted">
              Quando alguém atribuir, comentar, cobrar ou mudar a etapa de uma tarefa sua, ou colocar você numa gravação, aparece aqui.
            </p>
          </div>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {data.notices.map((n) => {
              const fresh = isUnread(n, highlightSince);
              return (
                <li key={n.key}>
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={cn("flex items-start gap-3 rounded-tile px-2 py-3 transition-colors hover:bg-mist/70", fresh && "bg-brand/[0.06]")}
                  >
                    <PersonAvatar name={n.actorName} src={n.actorAvatar} className="size-9 text-[10px]" />
                    <span className="min-w-0 flex-1 text-sm leading-snug">
                      <strong className="font-bold">{n.actorName}</strong> <span className="font-light">{n.text}</span>{" "}
                      <span className="font-semibold break-words">{n.title}</span>
                      {n.note && <span className="mt-1 block font-light break-words text-ink/80">“{n.note}”</span>}
                      <span className="mt-0.5 block text-xs font-medium text-muted">{timeAgo(n.createdAt)}</span>
                    </span>
                    {fresh && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="novo" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );
}
