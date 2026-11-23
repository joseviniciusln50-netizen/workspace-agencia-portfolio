/**
 * Regras do perfil (puras — usadas no servidor e no navegador; testadas no Vitest).
 * Os limites espelham o banco (profiles: full_name ≤ 120, bio ≤ 500; bucket avatars ≤ 2 MB).
 */

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const BIO_MAX = 500;

/** Foto enviada pelo usuário ANTES do recorte (o navegador reduz para 512×512). */
export const AVATAR_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
/** Foto processada que chega ao servidor (512×512 WebP/JPEG costuma ter < 150 KB). */
export const AVATAR_UPLOAD_MAX_BYTES = 1024 * 1024;
export const AVATAR_SIZE = 512;
export const AVATAR_ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;
export type AvatarMime = (typeof AVATAR_ACCEPT)[number];

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Nome de exibição: espaços normalizados, 2–80 caracteres, sem caracteres de controle. */
export function normalizeDisplayName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function displayNameProblem(name: string): string | null {
  if (name.length < NAME_MIN) return "Informe seu nome (pelo menos 2 caracteres).";
  if (name.length > NAME_MAX) return `Use no máximo ${NAME_MAX} caracteres no nome.`;
  if (CONTROL_CHARS.test(name)) return "O nome contém caracteres inválidos.";
  if (!/\p{L}/u.test(name)) return "O nome precisa ter letras.";
  return null;
}

export function normalizeBio(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function bioProblem(bio: string): string | null {
  if (bio.length > BIO_MAX) return `Use no máximo ${BIO_MAX} caracteres na descrição.`;
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(bio)) return "A descrição contém caracteres inválidos.";
  return null;
}

/** Tipo REAL da imagem pelos primeiros bytes (não confia na extensão nem no tipo declarado). */
export function detectImageType(bytes: Uint8Array): AvatarMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) return "image/webp";
  return null;
}

export const EXTENSION: Record<AvatarMime, "webp" | "jpg" | "png"> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Mesmo formato que o banco aceita (constraint profiles_avatar_path_format). */
export const AVATAR_PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,64}\.(webp|jpg|png)$/;

export function isOwnAvatarPath(path: string, userId: string): boolean {
  return AVATAR_PATH_RE.test(path) && path.split("/")[0] === userId;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Endereço da foto dentro do app (a rota /avatar/<id> confere a sessão e lê do bucket privado).
 * O `v` muda a cada nova foto → o navegador pode guardar em cache sem mostrar foto antiga.
 */
export function avatarSrc(userId: string, path: string | null | undefined): string | null {
  if (!path || !AVATAR_PATH_RE.test(path)) return null;
  const version = path.split("/")[1]!.split(".")[0]!.slice(0, 16);
  return `/avatar/${userId}?v=${version}`;
}
