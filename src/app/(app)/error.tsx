"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { buttonClass } from "@/components/ui/button";

/**
 * Erro inesperado na área logada (ex.: o banco não respondeu por um instante).
 * Mostra uma mensagem da agência em vez da página genérica, com "Tentar de novo".
 * (Redirecionamentos de login e "não encontrado" não passam por aqui.)
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[workspace] erro inesperado:", error);
  }, [error]);

  return (
    <section className="flex flex-col items-start gap-4 py-16" role="alert">
      <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.24em] text-muted uppercase">
        <span className="h-[2px] w-5 bg-brand" aria-hidden />
        Algo deu errado
      </p>
      <h1 className="text-[2.125rem] leading-[0.95] tracking-tight md:text-5xl">
        <span className="font-light">Não foi possível</span> <strong className="font-extrabold">carregar</strong>
        <span className="text-brand">.</span>
      </h1>
      <p className="max-w-md text-[15px] font-light text-muted">
        Pode ser uma falha momentânea de conexão. Seus dados estão salvos. Tente de novo em alguns segundos.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className={buttonClass("dark", "md", "gap-2 px-5")}
        >
          <RotateCcw className="size-4" /> Tentar de novo
        </button>
        <Link href="/dashboard" className="inline-flex h-11 items-center rounded-tile border border-hairline px-5 text-xs font-bold tracking-wide uppercase">
          Ir para o início
        </Link>
      </div>
    </section>
  );
}
