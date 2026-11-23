import { BrandSeal } from "@/components/brand/logo";

/** Enquanto a sessão é conferida no servidor: fundo preto com o selo J (carregamento). */
export function ShellFallback() {
  return (
    <div aria-busy="true" aria-label="Carregando o Workspace" className="fixed inset-0 z-50 grid place-items-center bg-ink">
      <BrandSeal eager className="h-28 animate-[seal-breathe_1.6s_ease-in-out_infinite] motion-reduce:animate-none" />
    </div>
  );
}
