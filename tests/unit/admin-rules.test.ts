import { describe, expect, it } from "vitest";
import {
  inviteMessage,
  isPlausibleCode,
  normalizeCode,
  normalizeEmail,
  permissionsFor,
  PUBLISHED_SITE_URL,
  PROFESSIONAL_ROLES,
  roleLabel,
  sanitizeRoles,
  shareableSiteUrl,
} from "@/lib/admin/rules";
import { isPublicPath } from "@/lib/auth/routes";

describe("funções profissionais", () => {
  it("catálogo com as 10 funções definidas pela direção", () => {
    expect(PROFESSIONAL_ROLES.map((r) => r.label)).toEqual([
      "CEO",
      "Diretor Criativo",
      "Designer",
      "Videomaker",
      "Editor",
      "Social Media",
      "Storymaker",
      "Desenvolvedor",
      "Motion Designer",
      "Especialista em IA e Automação",
    ]);
  });
  it("aceita várias funções; descarta inválidas e repetidas", () => {
    expect(sanitizeRoles(["social_media", "desenvolvedor", "videomaker", "desenvolvedor"])).toEqual([
      "videomaker",
      "social_media",
      "desenvolvedor",
    ]);
    expect(sanitizeRoles(["admin", "principal", 42, null])).toEqual([]);
    expect(sanitizeRoles("ceo")).toEqual([]);
    expect(roleLabel("ia_automacao")).toBe("Especialista em IA e Automação");
  });
});

describe("código de ativação", () => {
  it("aceita com ou sem hífen, maiúsculas ou minúsculas", () => {
    expect(normalizeCode("abcd-ef23")).toBe("ABCDEF23");
    expect(isPlausibleCode("ABCD-EF23")).toBe(true);
    expect(isPlausibleCode("abcd ef23")).toBe(true);
  });
  it("recusa tamanho errado e caracteres ambíguos (0, O, 1, I, L)", () => {
    expect(isPlausibleCode("ABC-123")).toBe(false);
    expect(isPlausibleCode("ABCD-EF0O")).toBe(false);
    expect(isPlausibleCode("ABCD-EF1I")).toBe(false);
  });
  it("e-mail normalizado", () => {
    expect(normalizeEmail("  Pessoa@Agencia.COM ")).toBe("pessoa@agencia.com");
  });
  it("mensagem para WhatsApp com link de ativação e código", () => {
    const msg = inviteMessage("ABCD-EF23", "https://ajm.exemplo");
    expect(msg).toContain("https://ajm.exemplo/ativar");
    expect(msg).toContain("ABCD-EF23");
  });
  it("tela de ativação é pública (sem login)", () => {
    expect(isPublicPath("/ativar")).toBe(true);
  });
});

describe("permissões (espelho das funções do banco)", () => {
  it("principal: gerencia admins e colaboradores, nunca a si mesmo", () => {
    expect(permissionsFor("principal", "colaborador", false)).toEqual({ editRoles: true, changeLevel: true, toggleActive: true, resetPassword: true, transferTo: true });
    expect(permissionsFor("principal", "admin", false).toggleActive).toBe(true);
    expect(permissionsFor("principal", "principal", true)).toMatchObject({ changeLevel: false, toggleActive: false, transferTo: false });
  });
  it("admin: funções de todos; desativa só colaboradores; não muda níveis", () => {
    expect(permissionsFor("admin", "colaborador", false)).toEqual({ editRoles: true, changeLevel: false, toggleActive: true, resetPassword: true, transferTo: false });
    expect(permissionsFor("admin", "admin", false).toggleActive).toBe(false);
    expect(permissionsFor("admin", "principal", false).toggleActive).toBe(false);
    expect(permissionsFor("admin", "admin", true).changeLevel).toBe(false);
    expect(permissionsFor("admin", "admin", false).resetPassword).toBe(false);
    expect(permissionsFor("principal", "principal", true).resetPassword).toBe(false);
  });
  it("colaborador: nada administrativo", () => {
    expect(permissionsFor("colaborador", "colaborador", false)).toEqual({ editRoles: false, changeLevel: false, toggleActive: false, resetPassword: false, transferTo: false });
  });
});

describe("shareableSiteUrl (links que vão para o celular de outra pessoa)", () => {
  it("usa o endereço configurado quando é https público", () => {
    expect(shareableSiteUrl("https://workspace.example.com/")).toBe("https://workspace.example.com");
    expect(shareableSiteUrl("https://app.agencia.com.br")).toBe("https://app.agencia.com.br");
  });
  it("nunca localhost, IP da rede, http ou vazio: cai no site publicado", () => {
    for (const v of [undefined, "", "http://localhost:3000", "https://localhost:3000", "http://192.168.1.5:3000", "https://10.0.0.2", "http://workspace.example.com", "lixo"]) {
      expect(shareableSiteUrl(v), String(v)).toBe(PUBLISHED_SITE_URL);
    }
  });
});
