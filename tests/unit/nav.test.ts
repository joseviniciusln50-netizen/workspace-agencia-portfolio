import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ITEMS,
  isActive,
  isAdmin,
  MOBILE_PRIMARY,
  moreItems,
  visibleItems,
  WORK_ITEMS,
} from "@/components/shell/nav-items";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("navegação reorganizada", () => {
  it("categorias de trabalho na ordem combinada", () => {
    expect(hrefs(WORK_ITEMS)).toEqual(["/dashboard", "/tarefas", "/gravacoes", "/briefings", "/clientes", "/equipe"]);
  });

  it("Administração só aparece para administradores", () => {
    expect(hrefs(visibleItems(ACCOUNT_ITEMS, "colaborador"))).toEqual(["/perfil"]);
    expect(hrefs(visibleItems(ACCOUNT_ITEMS, "admin"))).toEqual(["/perfil", "/admin"]);
    expect(hrefs(visibleItems(ACCOUNT_ITEMS, "principal"))).toEqual(["/perfil", "/admin"]);
    expect(isAdmin("colaborador")).toBe(false);
  });

  it("celular: no máximo 4 botões na barra (3 atalhos + Mais)", () => {
    expect(MOBILE_PRIMARY.length + 1).toBeLessThanOrEqual(4);
  });

  it("menu Mais tem o restante, sem repetir os atalhos", () => {
    expect(hrefs(moreItems("colaborador"))).toEqual(["/gravacoes", "/clientes", "/equipe", "/perfil"]);
    expect(hrefs(moreItems("principal"))).toEqual(["/gravacoes", "/clientes", "/equipe", "/perfil", "/admin"]);
    for (const h of MOBILE_PRIMARY) expect(hrefs(moreItems("principal"))).not.toContain(h);
  });

  it("item ativo inclui subpáginas", () => {
    expect(isActive("/equipe/ana", "/equipe")).toBe(true);
    expect(isActive("/equipes", "/equipe")).toBe(false);
  });
});
