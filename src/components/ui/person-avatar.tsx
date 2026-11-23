import { cn, initials } from "@/lib/utils";

/**
 * Avatar de uma PESSOA REAL: foto (bucket privado, via /avatar/<id>) ou iniciais.
 * `<img>` simples: a rota já devolve a imagem 512×512 otimizada e com cache.
 */
export function PersonAvatar({
  name,
  src,
  className,
  ringClassName = "ring-paper",
}: {
  name: string;
  src: string | null;
  className?: string;
  ringClassName?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-xs font-bold text-paper ring-2",
        ringClassName,
        className,
      )}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem já otimizada (512×512) pela própria rota
        <img src={src} alt="" className="size-full object-cover" draggable={false} decoding="async" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
