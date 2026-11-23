import { describe, expect, it } from "vitest";
import {
  hasSupabaseAuthCookie,
  isAuthRoute,
  isPublicPath,
  isStaticAsset,
  loginNotice,
  safeNextPath,
} from "@/lib/auth/routes";

describe("safeNextPath — destino após o login", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/tarefas")).toBe("/tarefas");
    expect(safeNextPath("/tarefas?view=postits")).toBe("/tarefas?view=postits");
    expect(safeNextPath("/equipe/123")).toBe("/equipe/123");
  });

  it.each([
    ["https://site-malicioso.com", "URL absoluta"],
    ["//site-malicioso.com", "protocolo relativo"],
    ["/\\site-malicioso.com", "barra invertida"],
    ["javascript:alert(1)", "esquema"],
    ["tarefas", "sem barra inicial"],
    ["/%0d%0aSet-Cookie:x", "caminho com controle codificado passa como texto, não como cabeçalho"],
  ])("bloqueia %s (%s)", (raw) => {
    const result = safeNextPath(raw);
    expect(result.startsWith("/")).toBe(true);
    expect(result.startsWith("//")).toBe(false);
    expect(result).not.toContain("site-malicioso");
  });

  it("não volta para as telas de login nem rotas técnicas", () => {
    expect(safeNextPath("/entrar")).toBe("/dashboard");
    expect(safeNextPath("/recuperar-senha")).toBe("/dashboard");
    expect(safeNextPath("/auth/encerrar")).toBe("/dashboard");
  });

  it("usa o padrão quando vazio", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath("/" + "a".repeat(600))).toBe("/dashboard");
  });
});

describe("classificação de rotas", () => {
  it("telas públicas", () => {
    expect(isPublicPath("/entrar")).toBe(true);
    expect(isPublicPath("/recuperar-senha")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/redefinir-senha")).toBe(false); // exige a sessão do link
    expect(isPublicPath("/entrarx")).toBe(false);
  });

  it("rotas técnicas de autenticação", () => {
    expect(isAuthRoute("/auth/confirm")).toBe(true);
    expect(isAuthRoute("/authx")).toBe(false);
  });

  it("arquivos estáticos não exigem sessão; páginas sim", () => {
    expect(isStaticAsset("/_next/static/chunks/a.js")).toBe(true);
    expect(isStaticAsset("/brand/web/monograma-ajm-vertical.png")).toBe(true);
    expect(isStaticAsset("/favicon.ico")).toBe(true);
    expect(isStaticAsset("/sw.js")).toBe(true);
    expect(isStaticAsset("/outro.js")).toBe(false); // só o service worker; nada de liberar .js em geral
    expect(isStaticAsset("/dashboard")).toBe(false);
    expect(isStaticAsset("/equipe/abc")).toBe(false);
  });

  it("detecta cookie de sessão do Supabase (inclusive fatiado)", () => {
    expect(hasSupabaseAuthCookie(["sb-abcdef-auth-token"])).toBe(true);
    expect(hasSupabaseAuthCookie(["sb-abcdef-auth-token.0", "sb-abcdef-auth-token.1"])).toBe(true);
    expect(hasSupabaseAuthCookie(["outro", "sb-abcdef-auth-token-code-verifier"])).toBe(false);
  });

  it("avisos da tela de login só para motivos conhecidos", () => {
    expect(loginNotice("expirada")).toMatch(/expirou/);
    expect(loginNotice("<script>")).toBeNull();
    expect(loginNotice(null)).toBeNull();
  });
});
