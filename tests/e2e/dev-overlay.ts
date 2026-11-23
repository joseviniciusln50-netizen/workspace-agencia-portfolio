import type { Page } from "@playwright/test";

/**
 * Esconde o indicador/painel de avisos do MODO DE DESENVOLVIMENTO do Next (`<nextjs-portal>`).
 * Ele não existe no site publicado, mas no dev o selo "1 Insight" pode parar em cima do dock
 * (ex.: botão "Mais") e interceptar cliques. Vale para todas as navegações da página.
 */
export async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal{display:none!important}";
    const add = () => document.head?.appendChild(style);
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add, { once: true });
  });
}
