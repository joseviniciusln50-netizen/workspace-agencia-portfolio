"use client";

import { ExternalLink, Link2, MessageSquare, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useMural } from "@/components/mural/mural-context";
import { useSessionUser } from "@/components/shell/session-context";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { addComment, addLink, deleteComment, editComment, getTaskThread, removeLink } from "@/lib/mural/actions";
import {
  canAddLink,
  canDeleteComment,
  canEditComment,
  canRemoveLink,
  COMMENT_MAX,
  linkLabel,
  type Task,
  type TaskComment,
  type TaskLink,
} from "@/lib/mural/model";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";

const label = "mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] text-muted uppercase";
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Links (anexos) e comentários de uma tarefa. Carregados ao abrir; atualizados após cada ação. */
export function TaskThread({ task }: { task: Task }) {
  const [thread, setThread] = useState<{ comments: TaskComment[]; links: TaskLink[] } | null>(null);
  // Recarrega quando a tarefa muda (cada ação dá refresh e as contagens mudam).
  const signature = `${task.id}:${task.commentCount}:${task.linkCount}`;

  useEffect(() => {
    let alive = true;
    getTaskThread(task.id).then((t) => alive && setThread(t));
    return () => {
      alive = false;
    };
  }, [task.id, signature]);

  return (
    <>
      <LinksSection task={task} links={thread?.links ?? null} />
      <CommentsSection task={task} comments={thread?.comments ?? null} onChanged={() => getTaskThread(task.id).then(setThread)} />
    </>
  );
}

/* ------------------------------------------------------------------ links */

function LinksSection({ task, links }: { task: Task; links: TaskLink[] | null }) {
  const me = useSessionUser();
  const { person } = useMural();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canAdd = canAddLink(me.accessLevel, me.id, task);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await addLink(task.id, url, title);
      if (r.ok) {
        setUrl("");
        setTitle("");
        setAdding(false);
      } else setError(r.error ?? "Não foi possível adicionar.");
    });
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className={label}>
          <Link2 className="size-3.5" /> Links e anexos
        </p>
        {canAdd && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mb-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand-text uppercase hover:underline"
          >
            <Plus className="size-3.5" /> Adicionar
          </button>
        )}
      </div>

      {links === null ? (
        <p className="text-xs font-light text-muted">Carregando…</p>
      ) : links.length === 0 && !adding ? (
        <p className="text-sm font-light text-muted">
          Nenhum link. {canAdd ? "Adicione a pasta do Drive, o arquivo no Figma, o vídeo…" : ""}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {links.map((l) => {
            const by = person(l.addedBy);
            return (
              <li key={l.id} className="group flex items-center gap-2 rounded-tile border border-hairline pr-1">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2 hover:bg-mist-soft"
                >
                  <ExternalLink className="size-4 shrink-0 text-brand-text" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{l.title || linkLabel(l.url)}</span>
                    <span className="block truncate text-[11px] font-light text-muted">
                      {linkLabel(l.url)} · {by ? (by.id === me.id ? "você" : by.name) : "—"}
                    </span>
                  </span>
                </a>
                {canRemoveLink(me.accessLevel, me.id, l) && (
                  <RemoveButton label={`Remover link ${l.title || linkLabel(l.url)}`} onConfirm={() => removeLink(l.id)} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-2 rounded-tile bg-mist-soft p-3">
          <label htmlFor={`link-url-${task.id}`} className="sr-only">
            Endereço do link
          </label>
          <input
            id={`link-url-${task.id}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="Cole o link (Drive, Figma, Canva, YouTube…)"
            className="h-11 rounded-tile border border-hairline bg-paper px-3 text-base outline-none focus:border-ink md:text-sm"
          />
          <label htmlFor={`link-title-${task.id}`} className="sr-only">
            Nome do link (opcional)
          </label>
          <input
            id={`link-title-${task.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Nome (opcional) — ex.: Pasta de artes"
            className="h-11 rounded-tile border border-hairline bg-paper px-3 text-base outline-none focus:border-ink md:text-sm"
          />
          {error && (
            <p role="alert" className="text-sm font-semibold text-brand-text">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || !url.trim()}
              className={buttonClass("dark", "md", "h-10")}
            >
              {pending ? "Salvando…" : "Salvar link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="h-10 rounded-tile border border-hairline bg-paper px-4 text-xs font-bold uppercase"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ comentários */

function CommentsSection({ task, comments, onChanged }: { task: Task; comments: TaskComment[] | null; onChanged: () => void }) {
  const me = useSessionUser();
  const { person } = useMural();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError(null);
    start(async () => {
      const r = await addComment(task.id, text);
      if (r.ok) setBody("");
      else setError(r.error ?? "Não foi possível comentar.");
    });
  }

  return (
    <section>
      <p className={label}>
        <MessageSquare className="size-3.5" /> Comentários {comments && comments.length > 0 && <span className="tabular-nums">({comments.length})</span>}
      </p>

      {comments === null ? (
        <p className="text-xs font-light text-muted">Carregando…</p>
      ) : comments.length === 0 ? (
        <p className="mb-3 text-sm font-light text-muted">Nenhum comentário ainda.</p>
      ) : (
        <ol className="mb-3 flex flex-col gap-3">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} author={person(c.authorId)} isMe={c.authorId === me.id} onChanged={onChanged} />
          ))}
        </ol>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <label htmlFor={`comment-${task.id}`} className="sr-only">
          Novo comentário
        </label>
        <textarea
          id={`comment-${task.id}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={COMMENT_MAX}
          rows={2}
          placeholder="Escreva um comentário…"
          className="min-h-12 min-w-0 flex-1 resize-y rounded-tile border border-hairline bg-paper px-3 py-2.5 text-base leading-snug outline-none focus:border-ink md:text-sm"
        />
        <button
          type="submit"
          disabled={pending || !body.trim()}
          aria-label="Enviar comentário"
          className="flex size-12 shrink-0 items-center justify-center rounded-tile bg-brand text-paper disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-brand-text">
          {error}
        </p>
      )}
    </section>
  );
}

function CommentItem({
  comment,
  author,
  isMe,
  onChanged,
}: {
  comment: TaskComment;
  author: { name: string; avatar: string | null } | undefined;
  isMe: boolean;
  onChanged: () => void;
}) {
  const me = useSessionUser();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const r = await editComment(comment.id, text);
      if (r.ok) {
        setEditing(false);
        onChanged();
      } else setError(r.error ?? "Não foi possível editar.");
    });
  }

  return (
    <li className="flex gap-3">
      <PersonAvatar name={author?.name ?? "?"} src={author?.avatar ?? null} className="mt-0.5 size-8 text-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-semibold">{isMe ? "Você" : (author?.name ?? "—")}</span>
          <span className="font-light text-muted">
            {when(comment.createdAt)}
            {comment.editedAt && " · editado"}
          </span>
        </p>
        {editing ? (
          <div className="mt-1 flex flex-col gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={COMMENT_MAX}
              rows={3}
              aria-label="Editar comentário"
              className="rounded-tile border border-hairline bg-paper px-3 py-2 text-base outline-none focus:border-ink md:text-sm"
            />
            {error && (
              <p role="alert" className="text-sm font-semibold text-brand-text">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={save} className="h-9 rounded-tile bg-ink px-3 text-[11px] font-bold text-paper uppercase">
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setText(comment.body);
                  setEditing(false);
                }}
                className="h-9 rounded-tile border border-hairline px-3 text-[11px] font-bold uppercase"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-[15px] leading-relaxed break-words whitespace-pre-line md:text-sm">{comment.body}</p>
        )}
        {!editing && (canEditComment(me.id, comment) || canDeleteComment(me.accessLevel, me.id, comment)) && (
          <div className="mt-1 flex gap-3">
            {canEditComment(me.id, comment) && (
              <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-ink">
                <Pencil className="size-3" /> Editar
              </button>
            )}
            {canDeleteComment(me.accessLevel, me.id, comment) && (
              <InlineDelete onConfirm={() => deleteComment(comment.id)} />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ confirmações */

function InlineDelete({ onConfirm }: { onConfirm: () => Promise<{ ok: boolean; error?: string }> }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return confirm ? (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold">
      <button type="button" disabled={pending} onClick={() => start(async () => void (await onConfirm()))} className="text-brand-text hover:underline">
        Confirmar exclusão
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="text-muted hover:text-ink">
        Cancelar
      </button>
    </span>
  ) : (
    <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-brand-text">
      <Trash2 className="size-3" /> Apagar
    </button>
  );
}

function RemoveButton({ label: aria, onConfirm }: { label: string; onConfirm: () => Promise<{ ok: boolean; error?: string }> }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return confirm ? (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await onConfirm()))}
      className="h-9 shrink-0 rounded-tile bg-brand px-2.5 text-[11px] font-bold text-paper uppercase"
    >
      Remover
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      aria-label={aria}
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-brand-text")}
    >
      <X className="size-4" />
    </button>
  );
}
