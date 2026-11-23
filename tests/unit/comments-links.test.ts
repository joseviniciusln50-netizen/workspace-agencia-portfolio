import { describe, expect, it } from "vitest";
import {
  canAddLink,
  canDeleteComment,
  canEditComment,
  canRemoveLink,
  commentProblem,
  linkLabel,
  linkProblem,
  normalizeUrl,
} from "@/lib/mural/model";

const ME = "me";
const OTHER = "outro";

describe("links (anexos) — só http(s)", () => {
  it("aceita links comuns e completa https:// quando falta", () => {
    expect(normalizeUrl("https://drive.google.com/drive/folders/abc")).toBe("https://drive.google.com/drive/folders/abc");
    expect(normalizeUrl("figma.com/file/xyz")).toBe("https://figma.com/file/xyz");
    expect(normalizeUrl("  https://youtu.be/abc  ")).toBe("https://youtu.be/abc");
  });

  it.each([
    ["javascript:alert(1)"],
    ["JaVaScRiPt:alert(1)"],
    ["data:text/html;base64,PHNjcmlwdD4="],
    ["file:///C:/segredo.txt"],
    ["ftp://servidor/arquivo"],
    ["https://usuario:senha@site.com"],
    ["https://localhost"],
    ["não é link"],
    [""],
  ])("recusa %s", (raw) => {
    expect(normalizeUrl(raw)).toBeNull();
    expect(linkProblem(raw, "")).not.toBeNull();
  });

  it("nome do link limitado", () => {
    expect(linkProblem("https://canva.com/x", "a".repeat(121))).toMatch(/120/);
    expect(linkProblem("https://canva.com/x", "Arte final")).toBeNull();
  });

  it("reconhece os serviços mais usados pela agência", () => {
    expect(linkLabel("https://docs.google.com/document/d/1")).toBe("Google Drive");
    expect(linkLabel("https://www.figma.com/file/1")).toBe("Figma");
    expect(linkLabel("https://wetransfer.com/downloads/1")).toBe("WeTransfer");
    expect(linkLabel("https://youtu.be/1")).toBe("YouTube");
    expect(linkLabel("https://exemplo.com.br/x")).toBe("exemplo.com.br");
  });
});

describe("comentários", () => {
  it("validação", () => {
    expect(commentProblem("Ficou ótimo!")).toBeNull();
    expect(commentProblem("   ")).toMatch(/escreva/i);
    expect(commentProblem("x".repeat(2001))).toMatch(/2000/);
  });
  it("editar: só o autor; apagar: autor ou administração", () => {
    expect(canEditComment(ME, { authorId: ME })).toBe(true);
    expect(canEditComment(ME, { authorId: OTHER })).toBe(false);
    expect(canDeleteComment("colaborador", ME, { authorId: OTHER })).toBe(false);
    expect(canDeleteComment("admin", ME, { authorId: OTHER })).toBe(true);
  });
});

describe("permissões de links", () => {
  it("adicionar: administração, responsáveis ou quem criou", () => {
    expect(canAddLink("colaborador", ME, { assigneeIds: [ME], createdBy: OTHER })).toBe(true);
    expect(canAddLink("colaborador", ME, { assigneeIds: [OTHER], createdBy: ME })).toBe(true);
    expect(canAddLink("colaborador", ME, { assigneeIds: [OTHER], createdBy: OTHER })).toBe(false);
    expect(canAddLink("principal", ME, { assigneeIds: [], createdBy: OTHER })).toBe(true);
  });
  it("remover: quem adicionou ou administração", () => {
    expect(canRemoveLink("colaborador", ME, { addedBy: ME })).toBe(true);
    expect(canRemoveLink("colaborador", ME, { addedBy: OTHER })).toBe(false);
    expect(canRemoveLink("admin", ME, { addedBy: OTHER })).toBe(true);
  });
});
