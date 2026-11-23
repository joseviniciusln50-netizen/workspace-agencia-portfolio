/**
 * Etapa 2 — Storage de fotos e edição do perfil, no banco REAL, com a chave PUBLICÁVEL.
 * Exige a migration 20261115120000_perfis_e_avatares aplicada. Mesmo usuário colaborador de rls.test.ts.
 * Comando: npm run test:db
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const enabled = Boolean(url && key && email && password && process.env.RUN_DB_TESTS === "1");

const client = () => createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

// PNG 1×1 válido
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
const OTHER_ID = "00000000-0000-4000-8000-000000000001";
const rand = () => crypto.randomUUID().replace(/-/g, "");

describe.skipIf(!enabled)("Etapa 2 — fotos de perfil e edição", () => {
  let db: SupabaseClient;
  let userId: string;
  let original: { full_name: string; bio: string; avatar_url: string | null };
  const created: string[] = [];

  beforeAll(async () => {
    db = client();
    const { data, error } = await db.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error("Falha ao entrar com o usuário de teste.");
    userId = data.user.id;
    const { data: me } = await db.from("profiles").select("full_name, bio, avatar_url").eq("id", userId).single();
    original = me as typeof original;
  });

  afterAll(async () => {
    if (!db) return;
    await db.from("profiles").update({ full_name: original.full_name, bio: original.bio, avatar_url: original.avatar_url }).eq("id", userId);
    if (created.length) await db.storage.from("avatars").remove(created);
    await db.auth.signOut();
  });

  it("edita o próprio nome de exibição e a descrição (persiste ao reler)", async () => {
    const up = await db.from("profiles").update({ full_name: "Colaborador Teste", bio: "Descrição de teste." }).eq("id", userId);
    expect(up.error).toBeNull();
    const { data } = await db.from("profiles").select("full_name, bio").eq("id", userId).single();
    expect(data).toEqual({ full_name: "Colaborador Teste", bio: "Descrição de teste." });
  });

  it("envia foto na PRÓPRIA pasta e aponta o perfil para ela", async () => {
    const path = `${userId}/${rand()}.png`;
    const up = await db.storage.from("avatars").upload(path, PNG, { contentType: "image/png" });
    expect(up.error).toBeNull();
    created.push(path);
    const set = await db.from("profiles").update({ avatar_url: path }).eq("id", userId);
    expect(set.error).toBeNull();
    const dl = await db.storage.from("avatars").download(path);
    expect(dl.error).toBeNull();
  });

  it("NÃO envia na pasta de outra pessoa", async () => {
    const up = await db.storage.from("avatars").upload(`${OTHER_ID}/${rand()}.png`, PNG, { contentType: "image/png" });
    expect(up.error).not.toBeNull();
  });

  it("NÃO aponta o perfil para a pasta de outra pessoa nem para URL externa", async () => {
    const a = await db.from("profiles").update({ avatar_url: `${OTHER_ID}/${rand()}.png` }).eq("id", userId);
    expect(a.error).not.toBeNull();
    const b = await db.from("profiles").update({ avatar_url: "https://site-externo.com/foto.png" }).eq("id", userId);
    expect(b.error).not.toBeNull();
  });

  it("NÃO aceita arquivo que não seja JPEG/PNG/WebP", async () => {
    const up = await db.storage
      .from("avatars")
      .upload(`${userId}/${rand()}.png`, new TextEncoder().encode("<svg></svg>"), { contentType: "image/svg+xml" });
    expect(up.error).not.toBeNull();
  });

  it("visitante sem login NÃO baixa fotos", async () => {
    const anon = client();
    const path = created[0];
    expect(path).toBeTruthy();
    const dl = await anon.storage.from("avatars").download(path!);
    expect(dl.error).not.toBeNull();
  });

  it("remove a própria foto", async () => {
    const path = created.pop()!;
    const set = await db.from("profiles").update({ avatar_url: null }).eq("id", userId);
    expect(set.error).toBeNull();
    const rm = await db.storage.from("avatars").remove([path]);
    expect(rm.error).toBeNull();
    expect(rm.data?.length).toBe(1);
  });
});
