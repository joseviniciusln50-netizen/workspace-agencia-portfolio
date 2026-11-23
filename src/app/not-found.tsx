import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center gap-4 px-6 py-16">
      <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.24em] text-muted uppercase">
        <span className="h-[2px] w-5 bg-brand" aria-hidden />
        Erro 404
      </p>
      <h1 className="text-[2.125rem] leading-[0.95] tracking-tight md:text-5xl">
        <span className="font-light">Página</span> <strong className="font-extrabold text-brand">não encontrada</strong>
        <span className="text-brand">.</span>
      </h1>
      <p className="text-[15px] font-light text-muted">O endereço não existe ou foi movido.</p>
      <Link href="/dashboard" className="rounded-tile bg-ink px-5 py-3 text-xs font-bold tracking-wide text-paper uppercase">
        Voltar ao início
      </Link>
    </main>
  );
}
