"use client";

import { motion } from "motion/react";
import { Camera, Check, PenLine, Trash2 } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useSessionUser } from "@/components/shell/session-context";
import { AccessLabel } from "@/components/shell/user-badge";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { SectionTitle } from "@/components/ui/primitives";
import { RoleChips } from "@/components/ui/role-chips";
import { removeAvatar, updateProfile, uploadAvatar, type ProfileFormState } from "@/lib/profile/actions";
import { AVATAR_ACCEPT, AVATAR_SOURCE_MAX_BYTES, BIO_MAX, NAME_MAX } from "@/lib/profile/rules";
import { AvatarCropper } from "./avatar-cropper";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Cabeçalho do PRÓPRIO perfil: foto (trocar/remover aqui mesmo), nome, funções e nível (discreto).
 * Superfície preta da marca (sólida — não é vidro). Mesmo fluxo de foto de antes (recorte → uploadAvatar).
 */
export function ProfileHero({ roles, bio }: { roles: string[]; bio: string }) {
  const user = useSessionUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    setError(null);
    setMessage(null);
    if (!f) return;
    if (!(AVATAR_ACCEPT as readonly string[]).includes(f.type)) {
      setError("Formato não aceito. Use uma foto JPEG, PNG ou WebP.");
      return;
    }
    if (f.size > AVATAR_SOURCE_MAX_BYTES) {
      setError("Arquivo muito grande (máx. 15 MB).");
      return;
    }
    setFile(f);
  }

  function save(blob: Blob) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("avatar", new File([blob], "avatar", { type: blob.type }));
      const res = await uploadAvatar(fd);
      if (res.ok) {
        setFile(null);
        setMessage("Foto atualizada.");
      } else setError(res.error ?? "Não foi possível salvar a foto.");
    });
  }

  function remove() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await removeAvatar();
      if (res.ok) setMessage("Foto removida.");
      else setError(res.error ?? "Não foi possível remover a foto.");
    });
  }

  function editProfile() {
    document.getElementById("identidade")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("full_name")?.focus({ preventScroll: true }), 400);
  }

  return (
    <motion.section
      aria-labelledby="perfil-nome"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative overflow-hidden rounded-card bg-ink text-paper"
    >
      {/* linguagem gráfica: grid fino + luz vermelha discreta atrás da foto */}
      <div aria-hidden className="brand-grid pointer-events-none absolute inset-0 text-paper/[0.05]" />
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 size-80 rounded-full bg-[radial-gradient(circle,rgb(255_0_0/0.28),transparent_65%)]" />

      <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-end md:p-8">
        {/* Foto + trocar */}
        <div className="relative w-fit">
          <PersonAvatar name={user.name} src={user.avatarUrl} className="size-28 text-3xl md:size-32" ringClassName="ring-ink" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            aria-label={user.avatarUrl ? "Alterar foto" : "Enviar foto"}
            className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full bg-paper text-ink shadow-[0_6px_16px_-6px_rgb(0_0_0/0.6)] ring-4 ring-ink transition-transform hover:scale-105 focus-visible:ring-brand focus-visible:outline-none active:scale-95 disabled:opacity-60"
          >
            <Camera className="size-[18px]" />
          </button>
          <input ref={inputRef} type="file" accept={AVATAR_ACCEPT.join(",")} onChange={pick} className="sr-only" tabIndex={-1} aria-hidden />
        </div>

        {/* Identidade */}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold tracking-[0.24em] text-paper/45 uppercase">
            <AccessLabel user={user} />
          </p>
          <h2 id="perfil-nome" className="mt-1 text-3xl leading-[1.05] font-extrabold tracking-tight break-words md:text-4xl">
            {user.name}
            <span className="text-brand">.</span>
          </h2>
          <RoleChips codes={roles} tone="dark" className="mt-2.5" />
          {bio && <p className="mt-3 line-clamp-2 max-w-xl text-sm font-light text-paper/70">{bio}</p>}
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
          <button
            type="button"
            onClick={editProfile}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-tile bg-paper px-4 text-xs font-bold tracking-wide text-ink uppercase transition-colors hover:bg-mist focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <PenLine className="size-4" /> Editar perfil
          </button>
          {user.avatarUrl && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-tile border border-paper/15 px-4 text-xs font-bold tracking-wide text-paper/80 uppercase transition-colors hover:border-paper/35 hover:text-paper disabled:opacity-60"
            >
              <Trash2 className="size-4" /> Remover
            </button>
          )}
        </div>
      </div>

      {(error || message) && (
        <div className="relative border-t border-paper/10 px-6 py-3 md:px-8">
          {error ? (
            <p role="alert" className="text-sm font-semibold text-paper">
              <span className="mr-2 inline-block h-[2px] w-3 bg-brand align-middle" />
              {error}
            </p>
          ) : (
            <p role="status" className="flex items-center gap-1.5 text-sm text-paper/80">
              <Check className="size-4 text-brand" /> {message}
            </p>
          )}
        </div>
      )}

      {file && <AvatarCropper file={file} busy={pending} onCancel={() => setFile(null)} onConfirm={save} />}
    </motion.section>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <motion.button
      type="submit"
      disabled={pending}
      whileTap={pending ? undefined : { scale: 0.98 }}
      className="h-12 rounded-tile bg-brand px-6 text-sm font-bold tracking-wide text-paper uppercase shadow-[0_10px_22px_-12px_rgb(255_0_0/0.7)] transition-[filter] hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar alterações"}
    </motion.button>
  );
}

const inputClass =
  "w-full rounded-tile border border-hairline bg-paper px-4 text-base outline-none transition-[border-color,box-shadow] duration-200 hover:border-ink/25 focus:border-ink focus:ring-4 focus:ring-ink/[0.06]";

/** Identidade: nome de exibição e descrição (mesma action `updateProfile`), funções só leitura. */
export function IdentityForm({ bio, roles }: { bio: string; roles: string[] }) {
  const user = useSessionUser();
  const [state, action] = useActionState<ProfileFormState, FormData>(updateProfile, {});
  const [bioLength, setBioLength] = useState(bio.length);

  return (
    <section id="identidade" aria-labelledby="identidade-titulo" className="scroll-mt-24">
      <SectionTitle>
        <span id="identidade-titulo">Identidade</span>
      </SectionTitle>
      <form action={action} className="flex flex-col gap-5 rounded-card border border-hairline bg-paper p-5 md:p-6">
        <div>
          <label htmlFor="full_name" className="mb-1.5 block text-[10px] font-bold tracking-[0.18em] text-muted uppercase">
            Nome de exibição
          </label>
          <input
            id="full_name"
            name="full_name"
            defaultValue={state.name ?? user.name}
            key={state.name ?? user.name}
            maxLength={NAME_MAX}
            required
            autoComplete="name"
            className={`${inputClass} h-12`}
          />
          <p className="mt-1.5 text-xs font-light text-muted">Aparece na saudação, na equipe e nas tarefas.</p>
        </div>
        <div>
          <label htmlFor="bio" className="mb-1.5 block text-[10px] font-bold tracking-[0.18em] text-muted uppercase">
            Descrição profissional
          </label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={state.bio ?? bio}
            maxLength={BIO_MAX}
            rows={4}
            onChange={(e) => setBioLength(e.target.value.length)}
            placeholder="Ex.: Designer focado em identidade visual e social media."
            className={`${inputClass} resize-y py-3 leading-relaxed`}
          />
          <p className="mt-1.5 text-right text-xs font-light text-muted tabular-nums">
            {bioLength}/{BIO_MAX}
          </p>
        </div>
        <div className="border-t border-hairline pt-4">
          <p className="text-[10px] font-bold tracking-[0.18em] text-muted uppercase">Funções profissionais</p>
          {roles.length > 0 ? <RoleChips codes={roles} className="mt-2" /> : <p className="mt-1 text-sm font-light text-muted">Nenhuma definida ainda.</p>}
          <p className="mt-2 text-xs font-light text-muted">Definidas pela administração.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <SaveButton />
          {state.error && (
            <p role="alert" className="text-sm font-semibold text-brand-text">
              {state.error}
            </p>
          )}
          {state.saved && !state.error && (
            <motion.p
              role="status"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-1.5 text-sm text-muted"
            >
              <Check className="size-4 text-brand-text" /> Perfil salvo.
            </motion.p>
          )}
        </div>
      </form>
    </section>
  );
}
