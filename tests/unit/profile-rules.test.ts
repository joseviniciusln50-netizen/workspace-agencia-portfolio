import { describe, expect, it } from "vitest";
import {
  AVATAR_PATH_RE,
  avatarSrc,
  bioProblem,
  detectImageType,
  displayNameProblem,
  isOwnAvatarPath,
  normalizeBio,
  normalizeDisplayName,
} from "@/lib/profile/rules";

const ID = "2b0c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER = "9f8e7d6c-5b4a-4321-8fed-cba987654321";

describe("nome de exibição", () => {
  it("normaliza espaços", () => {
    expect(normalizeDisplayName("  José   Vinícius  ")).toBe("José Vinícius");
  });
  it("valida tamanho e conteúdo", () => {
    expect(displayNameProblem("José Vinícius")).toBeNull();
    expect(displayNameProblem("J")).toMatch(/pelo menos 2/);
    expect(displayNameProblem("a".repeat(81))).toMatch(/80/);
    expect(displayNameProblem("12345")).toMatch(/letras/);
    expect(displayNameProblem("Nome\u0000")).toMatch(/inválidos/);
  });
});

describe("descrição", () => {
  it("aceita quebras de linha e limita a 500", () => {
    expect(bioProblem("Designer.\nSocial media.")).toBeNull();
    expect(bioProblem("x".repeat(501))).toMatch(/500/);
    expect(normalizeBio("a\r\n\r\n\r\n\r\nb")).toBe("a\n\nb");
  });
});

describe("tipo real da imagem (bytes iniciais)", () => {
  it("reconhece JPEG, PNG e WebP", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageType(webp)).toBe("image/webp");
  });
  it("recusa o resto (SVG, HTML, GIF, vazio)", () => {
    expect(detectImageType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("caminho da foto", () => {
  const path = `${ID}/${"a1b2c3d4".repeat(4)}.webp`;
  it("formato igual ao do banco", () => {
    expect(AVATAR_PATH_RE.test(path)).toBe(true);
    expect(AVATAR_PATH_RE.test("https://site.com/foto.png")).toBe(false);
    expect(AVATAR_PATH_RE.test(`${ID}/../segredo.webp`)).toBe(false);
  });
  it("só a própria pasta", () => {
    expect(isOwnAvatarPath(path, ID)).toBe(true);
    expect(isOwnAvatarPath(path, OTHER)).toBe(false);
  });
  it("endereço interno com versão (cache seguro)", () => {
    expect(avatarSrc(ID, path)).toBe(`/avatar/${ID}?v=a1b2c3d4a1b2c3d4`);
    expect(avatarSrc(ID, null)).toBeNull();
    expect(avatarSrc(ID, "https://site.com/x.png")).toBeNull();
  });
});
