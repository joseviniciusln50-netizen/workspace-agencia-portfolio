"use client";

import { useEffect } from "react";

/**
 * Convivência com a faixa "Powered by Netlify" (obrigatória no plano Free; NÃO a escondemos).
 * Ela é um <iframe id="nl-badge-frame"> fixo no canto inferior direito, por cima de tudo.
 * Medimos a altura dela e publicamos em `--badge-h` (0px quando não existe — ex.: localhost
 * ou quando o visitante a oculta). Barra inferior, painéis e o fim das páginas somam esse valor.
 */
export function BadgeSafeArea() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const frame = document.getElementById("nl-badge-frame");
      const r = frame?.getBoundingClientRect();
      const visible = frame && r && r.height > 0 && getComputedStyle(frame).display !== "none";
      root.style.setProperty("--badge-h", visible ? `${Math.ceil(r.height)}px` : "0px");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return null;
}
