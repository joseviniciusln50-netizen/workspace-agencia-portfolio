/**
 * Testes de SEGURANÇA no banco real (RLS + permissões por coluna), com a chave PUBLICÁVEL —
 * exatamente o que um navegador (ou uma requisição manipulada) consegue fazer.
 *
 * Rodam só quando existirem no .env.local (nunca no Git):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *   TEST_USER_EMAIL, TEST_USER_PASSWORD   (um usuário COLABORADOR de teste)
 * Comando: npm run test:db
 * Nenhuma credencial é impressa.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const enabled = Boolean(url && key && email && password && process.env.RUN_DB_TESTS === "1");

const client = () =>
  createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

describe.skipIf(!enabled)("RLS — visitante sem login", () => {
  it("não lê perfis nem o histórico de privilégios", async () => {
    const anon = client();
    const profiles = await anon.from("profiles").select("id");
    expect(profiles.data ?? []).toHaveLength(0);
    const audit = await anon.from("access_audit").select("id");
    expect(audit.data ?? []).toHaveLength(0);
  });
});

describe.skipIf(!enabled)("RLS — colaborador logado", () => {
  let db: SupabaseClient;
  let userId: string;
  let originalName = "";

  beforeAll(async () => {
    db = client();
    const { data, error } = await db.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error("Falha ao entrar com o usuário de teste (confira TEST_USER_* no .env.local).");
    userId = data.user.id;
    const { data: me } = await db.from("profiles").select("full_name, access_level").eq("id", userId).single();
    originalName = me?.full_name ?? "";
    if (me?.access_level !== "colaborador") {
      throw new Error("Use um usuário COLABORADOR para estes testes (não o administrador principal).");
    }
  });

  afterAll(async () => {
    if (db && userId) {
      await db.from("profiles").update({ full_name: originalName }).eq("id", userId);
      await db.auth.signOut();
    }
  });

  it("lê o próprio perfil, que nasce sem privilégios", async () => {
    const { data, error } = await db.from("profiles").select("id, access_level, is_active").eq("id", userId).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: userId, access_level: "colaborador", is_active: true });
  });

  it("edita o próprio nome", async () => {
    const { error } = await db.from("profiles").update({ full_name: "Teste RLS" }).eq("id", userId);
    expect(error).toBeNull();
  });

  it("NÃO consegue se promover (nível de acesso)", async () => {
    const { error } = await db.from("profiles").update({ access_level: "principal" }).eq("id", userId);
    expect(error).not.toBeNull();
    const { data } = await db.from("profiles").select("access_level").eq("id", userId).single();
    expect(data?.access_level).toBe("colaborador");
  });

  it("NÃO consegue alterar o próprio status de ativo", async () => {
    const { error } = await db.from("profiles").update({ is_active: false }).eq("id", userId);
    expect(error).not.toBeNull();
  });

  it("NÃO consegue alterar o perfil de outra pessoa", async () => {
    const { data } = await db
      .from("profiles")
      .update({ full_name: "invasão" })
      .neq("id", userId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("NÃO cria nem apaga perfis", async () => {
    const insert = await db.from("profiles").insert({ id: crypto.randomUUID(), full_name: "x" });
    expect(insert.error).not.toBeNull();
    const del = await db.from("profiles").delete().eq("id", userId).select("id");
    expect(del.data ?? []).toHaveLength(0);
    const still = await db.from("profiles").select("id").eq("id", userId).single();
    expect(still.data?.id).toBe(userId);
  });

  it("NÃO lê o histórico de privilégios nem escreve nele", async () => {
    const read = await db.from("access_audit").select("id");
    expect(read.data ?? []).toHaveLength(0);
    const write = await db.from("access_audit").insert({ target_id: userId, reason: "forjado" });
    expect(write.error).not.toBeNull();
  });

  it("NÃO alcança as funções internas (nomeação do principal)", async () => {
    const { error } = await db.rpc("bootstrap_principal", { target_email: email! });
    expect(error).not.toBeNull();
  });
});
