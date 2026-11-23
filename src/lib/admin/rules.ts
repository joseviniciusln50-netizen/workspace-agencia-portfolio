import type { AccessLevel } from "@/lib/auth/access";

/**
 * Regras da administração (puras — espelham as funções do banco; testadas no Vitest).
 * A decisão FINAL é sempre do banco (funções SECURITY DEFINER); aqui só orientam a interface.
 */

/** Catálogo fixo (igual a public.professional_roles). */
export const PROFESSIONAL_ROLES = [
  { code: "ceo", label: "CEO" },
  { code: "diretor_criativo", label: "Diretor Criativo" },
  { code: "designer", label: "Designer" },
  { code: "videomaker", label: "Videomaker" },
  { code: "editor", label: "Editor" },
  { code: "social_media", label: "Social Media" },
  { code: "storymaker", label: "Storymaker" },
  { code: "desenvolvedor", label: "Desenvolvedor" },
  { code: "motion_designer", label: "Motion Designer" },
  { code: "ia_automacao", label: "Especialista em IA e Automação" },
] as const;

export type RoleCode = (typeof PROFESSIONAL_ROLES)[number]["code"];

const ROLE_CODES = new Set<string>(PROFESSIONAL_ROLES.map((r) => r.code));

export function roleLabel(code: string): string {
  return PROFESSIONAL_ROLES.find((r) => r.code === code)?.label ?? code;
}

/** Mantém só códigos válidos, sem repetição, na ordem do catálogo. */
export function sanitizeRoles(codes: unknown): RoleCode[] {
  if (!Array.isArray(codes)) return [];
  const wanted = new Set(codes.filter((c): c is string => typeof c === "string" && ROLE_CODES.has(c)));
  return PROFESSIONAL_ROLES.filter((r) => wanted.has(r.code)).map((r) => r.code);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Código de ativação: 8 caracteres (sem 0/O, 1/I/L), aceito com ou sem hífen/espaços, maiúsculas ou minúsculas. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isPlausibleCode(raw: string): boolean {
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(normalizeCode(raw));
}

/** O que quem está logado pode fazer com outra pessoa (espelha o banco). */
export function permissionsFor(actor: AccessLevel, target: AccessLevel, isSelf: boolean) {
  const isAdmin = actor === "principal" || actor === "admin";
  return {
    editRoles: isAdmin,
    changeLevel: actor === "principal" && !isSelf && target !== "principal",
    toggleActive: isAdmin && !isSelf && target !== "principal" && (actor === "principal" || target === "colaborador"),
    resetPassword: isAdmin && !isSelf && target !== "principal" && (actor === "principal" || target === "colaborador"),
    transferTo: actor === "principal" && !isSelf,
  };
}

/** Endereço publicado: destino dos links que vão para o celular de OUTRA pessoa. */
export const PUBLISHED_SITE_URL = "https://workspace.example.com";

/**
 * Base dos links de convite e de nova senha. Esses links são abertos no celular de outra pessoa, então
 * NUNCA podem ser localhost ou IP da rede, mesmo quando gerados no computador de desenvolvimento.
 * O banco é o mesmo nos dois casos: o link publicado funciona.
 */
export function shareableSiteUrl(configured: string | undefined): string {
  const v = (configured ?? "").trim().replace(/\/+$/, "");
  try {
    const u = new URL(v);
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
    if (u.protocol === "https:" && !local) return v;
  } catch {
    /* vazio ou inválido */
  }
  return PUBLISHED_SITE_URL;
}

/** Mensagem de convite pronta para copiar e mandar pelo WhatsApp. */
export function inviteMessage(code: string, siteUrl: string): string {
  return [
    "Olá! Seu acesso ao Workspace está liberado.",
    `1. Abra ${siteUrl}/ativar`,
    "2. Informe seu nome, este e-mail e o código abaixo, e crie sua senha.",
    `Código de ativação: ${code}`,
    "O código vale por 7 dias e só pode ser usado uma vez.",
  ].join("\n");
}
