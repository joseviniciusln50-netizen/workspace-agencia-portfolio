/**
 * Etapa 3 — administração e ativação, no banco REAL.
 * - Colaborador (chave publicável): NÃO consegue usar nenhuma função administrativa.
 * - Servidor (chave secreta, se configurada): código de ativação é de uso único e conta tentativas.
 * Exige a migration 20261115180000_ativacao_funcoes_admin aplicada. Comando: npm run test:db
 */
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const enabled = Boolean(url && key && email && password && process.env.RUN_DB_TESTS === "1");

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const SOMEONE = "00000000-0000-4000-8000-000000000001";

describe.skipIf(!enabled)("Etapa 3 — colaborador não administra", () => {
  let db: SupabaseClient;
  let userId: string;

  beforeAll(async () => {
    db = createClient(url!, key!, opts);
    const { data, error } = await db.auth.signInWithPassword({ email: email!, password: password! });
    if (error || !data.user) throw new Error("Falha ao entrar com o usuário de teste.");
    userId = data.user.id;
  });
  afterAll(async () => {
    await db?.auth.signOut();
  });

  it("lê o catálogo de funções (10)", async () => {
    const { data, error } = await db.from("professional_roles").select("code");
    expect(error).toBeNull();
    expect(data).toHaveLength(10);
  });

  it("NÃO atribui funções (nem a si mesmo)", async () => {
    const a = await db.rpc("admin_set_roles", { target: userId, roles: ["ceo"] });
    expect(a.error).not.toBeNull();
    const b = await db.from("profile_roles").insert({ profile_id: userId, role_code: "ceo" });
    expect(b.error).not.toBeNull();
  });

  it("NÃO altera níveis, NÃO desativa, NÃO transfere o principal", async () => {
    expect((await db.rpc("admin_set_access_level", { target: SOMEONE, new_level: "admin" })).error).not.toBeNull();
    expect((await db.rpc("admin_set_access_level", { target: userId, new_level: "admin" })).error).not.toBeNull();
    expect((await db.rpc("admin_set_active", { target: SOMEONE, active: false })).error).not.toBeNull();
    expect((await db.rpc("transfer_principal", { target: userId })).error).not.toBeNull();
    expect((await db.rpc("admin_authorize_password_reset", { target: SOMEONE })).error).not.toBeNull();
    const me = await db.from("profiles").select("access_level").eq("id", userId).single();
    expect(me.data?.access_level).toBe("colaborador");
  });

  it("NÃO cria nem vê convites, e NÃO usa as funções de ativação do servidor", async () => {
    expect((await db.rpc("admin_create_invite", { p_email: "alguem@example.com" })).error).not.toBeNull();
    expect((await db.rpc("admin_revoke_invite", { invite: SOMEONE })).error).not.toBeNull();
    const list = await db.from("activation_invites").select("id");
    expect(list.data ?? []).toHaveLength(0);
    expect((await db.rpc("claim_invite", { p_email: "alguem@example.com", p_code: "ABCDEFGH" })).error).not.toBeNull();
    expect((await db.rpc("finish_invite", { invite: SOMEONE, new_user: userId })).error).not.toBeNull();
  });

  it("visitante sem login também não", async () => {
    const anon = createClient(url!, key!, opts);
    expect((await anon.rpc("admin_create_invite", { p_email: "x@example.com" })).error).not.toBeNull();
    expect((await anon.rpc("claim_invite", { p_email: "x@example.com", p_code: "ABCDEFGH" })).error).not.toBeNull();
    expect((await anon.from("profile_roles").select("profile_id")).data ?? []).toHaveLength(0);
  });
});

describe.skipIf(!enabled || !secret)("Etapa 3 — servidor (chave secreta), privilégio mínimo", () => {
  const admin = () => createClient(url!, secret!, opts);

  it("chama as funções de ativação (convite inexistente → resposta neutra, sem erro)", async () => {
    const r = await admin().rpc("claim_invite", { p_email: `ninguem.${randomUUID().slice(0, 8)}@example.com`, p_code: "ABCD-EF23" });
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
  });

  it("NÃO lê nem grava as tabelas diretamente (só pelas funções do banco)", async () => {
    const read = await admin().from("activation_invites").select("id").limit(1);
    expect(read.error).not.toBeNull();
    const write = await admin()
      .from("activation_invites")
      .insert({ email: "x@example.com", code_hash: createHash("sha256").update("X").digest("hex"), invited_by: SOMEONE });
    expect(write.error).not.toBeNull();
  });
});
