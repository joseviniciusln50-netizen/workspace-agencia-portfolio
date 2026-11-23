import { cn } from "@/lib/utils";

/**
 * VERSÃO DE PORTFÓLIO — sem marcas.
 * No sistema real, estes componentes exibem os arquivos oficiais da agência (marcas registradas),
 * que NÃO fazem parte deste repositório. Aqui ficam marcadores de texto neutros com a mesma API,
 * para o projeto compilar e rodar.
 */

interface BrandImageProps {
  className?: string;
  /** Mantido por compatibilidade com a API original. */
  eager?: boolean;
}

function Wordmark({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 select-none items-center font-extrabold uppercase tracking-[0.2em] text-paper",
        className,
      )}
    >
      {text}
    </span>
  );
}

export function BrandLogo({ className }: BrandImageProps) {
  return <Wordmark text="Workspace" className={className} />;
}

export function BrandSymbol({ className }: BrandImageProps) {
  return <Wordmark text="W" className={cn("h-16 text-4xl", className)} />;
}

export function BrandSeal({ className }: BrandImageProps) {
  return <Wordmark text="Workspace" className={className} />;
}

export function BrandMonogram({ className }: BrandImageProps) {
  return <Wordmark text="W" className={cn("h-14 text-3xl", className)} />;
}

export function LetteringAgencia({ className }: BrandImageProps) {
  return <Wordmark text="Agência" className={className} />;
}

export function LetteringRec({ className }: BrandImageProps) {
  return <Wordmark text="REC" className={cn("text-[10px]", className)} />;
}

export function SloganNegative({ className }: BrandImageProps) {
  return <Wordmark text="Workspace" className={className} />;
}

export function SloganPositive({ className }: BrandImageProps) {
  return <Wordmark text="Workspace" className={cn("text-ink", className)} />;
}

export function Seal360Positive({ className }: BrandImageProps) {
  return <Wordmark text="Workspace" className={cn("text-ink", className)} />;
}

/** No original: traçados decorativos da identidade visual. Aqui não exibe nada. */
export function BrandTraces({}: { variant?: 1 | 2; className?: string }) {
  return null;
}

export function SloganSeal({ className }: BrandImageProps) {
  return <Wordmark text="Workspace" className={className} />;
}
