/*
 * Tema sazonal (hoje só o de Natal) — regras puras, testadas no Vitest.
 * A decoração NUNCA entra na identidade: é uma camada à parte que liga/desliga sozinha.
 *
 * Controle (do mais forte para o mais fraco):
 * 1. ?tema=natal | ?tema=padrao na URL → só nesta visita (pré-visualizar sem publicar);
 * 2. NEXT_PUBLIC_TEMA_SAZONAL = "natal" (sempre ligado) | "off" (sempre desligado) | "auto" (padrão);
 * 3. "auto": de 15/nov a 6/jan (Dia de Reis), pelo dia de Brasília. (Início antecipado de 1º/dez a pedido do usuário em 18/11/2026.)
 */

export type Season = "natal" | null;

export const CHRISTMAS_START = "11-15";
export const CHRISTMAS_END = "01-06";

/** `today` = yyyy-mm-dd. */
export function inChristmasWindow(today: string): boolean {
  const md = today.slice(5);
  return md >= CHRISTMAS_START || md <= CHRISTMAS_END;
}

export function resolveSeason(opts: { today: string; setting?: string | null; urlParam?: string | null }): Season {
  const url = opts.urlParam?.trim().toLowerCase();
  if (url === "natal") return "natal";
  if (url === "padrao" || url === "off") return null;
  const setting = (opts.setting ?? "auto").trim().toLowerCase();
  if (setting === "natal" || setting === "on") return "natal";
  if (setting === "off") return null;
  return inChristmasWindow(opts.today) ? "natal" : null;
}
