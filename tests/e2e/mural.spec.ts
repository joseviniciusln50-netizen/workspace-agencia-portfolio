import { expect, test, type Page } from "@playwright/test";
import { hideDevOverlay } from "./dev-overlay";
import { createClient } from "@supabase/supabase-js";

/**
 * Mural real pela INTERFACE, com o colaborador de teste. Tudo que é criado aqui é excluído no fim.
 * (As regras de permissão em si são provadas no banco: tests/integration/mural.test.ts.)
 */
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
test.skip(!email || !password, "defina TEST_USER_EMAIL e TEST_USER_PASSWORD no .env.local");
test.describe.configure({ mode: "serial" });
test.beforeEach(({ page }) => hideDevOverlay(page));

async function login(page: Page) {
  await page.goto("/entrar");
  await page.locator("input[name=email]").fill(email!);
  await page.locator("input[name=password]").fill(password!);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const stamp = () => `E2E ${Date.now().toString(36)}`;

/** Rede de segurança: apaga (pela conta de teste) tudo que os testes criaram e possa ter sobrado. */
test.afterAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await db.auth.signInWithPassword({ email: email!, password: password! });
  const me = data.user?.id;
  if (!me) return;
  const isTest = (s: string) => s.startsWith("E2E ");
  for (const t of (await db.from("tasks").select("id, title, created_by")).data ?? [])
    if (isTest(t.title) && t.created_by === me) await db.rpc("task_delete", { p_task: t.id });
  for (const b of (await db.from("briefings").select("id, title, created_by")).data ?? [])
    if (isTest(b.title) && b.created_by === me) await db.rpc("briefing_delete", { p_briefing: b.id });
  for (const n of (await db.from("notes").select("id, text, author_id")).data ?? [])
    if (isTest(n.text) && n.author_id === me) await db.rpc("note_delete", { p_note: n.id });
  await db.auth.signOut();
});

test("tarefa: criar, mover (responsável pode aprovar), checklist e excluir", async ({ page }) => {
  const title = `${stamp()} — tarefa`;
  await login(page);
  await page.goto("/tarefas");
  await page.getByRole("button", { name: /nova tarefa/i }).first().click();

  const form = page.getByRole("dialog", { name: "Nova tarefa" });
  await form.locator("#task-title").fill(title);
  await form.locator("#task-checklist").fill("Roteiro\nGravação");
  await expect(form.getByText(/esta tarefa será sua/i)).toBeVisible(); // colaborador: só para si
  await form.getByRole("button", { name: /criar tarefa/i }).click();
  await expect(form).toBeHidden();

  const card = page.getByRole("button", { name: new RegExp(title) });
  await expect(card).toBeVisible();

  // filtros: "Só as minhas" mantém a tarefa; cliente "Interno" também (tarefa sem cliente)
  await page.locator("#f-person").selectOption("minhas");
  await page.locator("#f-client").selectOption("interno");
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: /limpar/i }).click();

  // busca: acha pelo título (sem acento/maiúscula) e esconde com palavra que não existe
  await page.locator("#f-q").fill("TAREFA e2e");
  await expect(card).toBeVisible();
  await page.locator("#f-q").fill(`${title} inexistente-xyz`);
  await expect(card).toHaveCount(0);
  await expect(page.getByText(/nenhuma tarefa com esses filtros/i)).toBeVisible();
  await page.getByRole("button", { name: /limpar/i }).click();
  await expect(card).toBeVisible();

  // link direto: /tarefas?tarefa=<id> abre a própria tarefa
  await card.click();
  await expect(page.getByRole("button", { name: /copiar link/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await card.click();

  const sheet = page.getByRole("dialog", { name: title });
  await sheet.getByRole("button", { name: "Em produção" }).click();
  await expect(sheet.getByRole("button", { name: "Em produção" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Aprovado" })).toBeEnabled(); // responsável aprova
  await expect(sheet.getByRole("button", { name: "Postado" })).toBeEnabled();

  await sheet.getByRole("checkbox", { name: "Roteiro" }).click();
  await expect(sheet.getByRole("checkbox", { name: "Roteiro" })).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByText(/criou a tarefa/)).toBeVisible();
  // espera o servidor confirmar (o histórico registra) antes de recarregar
  await expect(sheet.getByText(/marcou um item do checklist/)).toBeVisible();
  await expect(sheet.getByText(/para “Em produção”/)).toBeVisible();

  await page.reload(); // persistência
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const again = page.getByRole("dialog", { name: title });
  await expect(again.getByRole("checkbox", { name: "Roteiro" })).toHaveAttribute("aria-checked", "true");
  await expect(again.getByRole("button", { name: "Em produção" })).toHaveAttribute("aria-pressed", "true");

  await again.getByRole("button", { name: "Excluir" }).click();
  await again.getByRole("button", { name: /confirmar exclusão/i }).click();
  await expect(page.getByRole("dialog", { name: title })).toBeHidden();
  await expect(page.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
  // a página continua de pé (antes, a exclusão derrubava a tela durante a animação de saída)
  await expect(page.getByRole("heading", { level: 1, name: /mural de tarefas/i })).toBeVisible();
  await expect(page.getByText(/couldn.t load|não foi possível carregar/i)).toHaveCount(0);
});

test("comentários e links na tarefa", async ({ page }) => {
  const title = `${stamp()} — conversa`;
  await login(page);
  await page.goto("/tarefas");
  await page.getByRole("button", { name: /nova tarefa/i }).first().click();
  const form = page.getByRole("dialog", { name: "Nova tarefa" });
  await form.locator("#task-title").fill(title);
  await form.getByRole("button", { name: /criar tarefa/i }).click();
  await expect(form).toBeHidden();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const sheet = page.getByRole("dialog", { name: title });

  // link: recusa javascript:, aceita Drive (sem https:// digitado)
  await sheet.getByRole("button", { name: /^adicionar$/i }).click();
  await sheet.getByPlaceholder(/cole o link/i).fill("javascript:alert(1)");
  await sheet.getByRole("button", { name: /salvar link/i }).click();
  await expect(sheet.getByRole("alert")).toContainText(/link válido/i);
  await sheet.getByPlaceholder(/cole o link/i).fill("drive.google.com/drive/folders/e2e");
  await sheet.getByPlaceholder(/nome \(opcional\)/i).fill("Pasta E2E");
  await sheet.getByRole("button", { name: /salvar link/i }).click();
  const link = sheet.getByRole("link", { name: /pasta e2e/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://drive.google.com/drive/folders/e2e");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);

  // comentário: enviar, editar, apagar
  await sheet.getByPlaceholder(/escreva um comentário/i).fill("Primeira versão no Drive.");
  await sheet.getByRole("button", { name: /enviar comentário/i }).click();
  await expect(sheet.getByText("Primeira versão no Drive.")).toBeVisible();
  await sheet.locator("li", { hasText: "Primeira versão no Drive." }).getByRole("button", { name: /^editar$/i }).click();
  await sheet.getByLabel("Editar comentário").fill("Versão 2 no Drive.");
  await sheet.getByRole("button", { name: /^salvar$/i }).click();
  await expect(sheet.getByText("Versão 2 no Drive.")).toBeVisible();
  await expect(sheet.getByText(/editado/)).toBeVisible();

  // persistência + contagens no cartão
  await page.reload();
  const card = page.getByRole("button", { name: new RegExp(title) });
  await expect(card.getByLabel("1 comentários")).toBeVisible();
  await expect(card.getByLabel("1 links")).toBeVisible();
  await card.click();
  const again = page.getByRole("dialog", { name: title });
  await expect(again.getByText("Versão 2 no Drive.")).toBeVisible();
  const comment = again.locator("li", { hasText: "Versão 2 no Drive." });
  await comment.getByRole("button", { name: /^apagar$/i }).click();
  await comment.getByRole("button", { name: /confirmar exclusão/i }).click();
  await expect(again.getByText("Versão 2 no Drive.")).toHaveCount(0);

  // limpeza
  await again.getByRole("button", { name: "Excluir" }).click();
  await again.getByRole("button", { name: /confirmar exclusão/i }).click();
  await expect(page.getByRole("dialog", { name: title })).toBeHidden();
});

test("post-it: fixar e remover", async ({ page }) => {
  const text = `${stamp()} — recado`;
  await login(page);
  await page.goto("/tarefas?view=postits");
  await page.locator("#new-note").fill(text);
  await page.getByRole("button", { name: /fixar/i }).click();
  const note = page.locator("article", { hasText: text });
  await expect(note).toBeVisible();
  await page.reload();
  await expect(note).toBeVisible();
  await note.hover();
  await note.getByRole("button", { name: /remover post-it/i }).click();
  await expect(note).toHaveCount(0);
});

test("briefing: registrar, gerar tarefa a partir dele e excluir", async ({ page }) => {
  const title = `${stamp()} — reunião`;
  const taskTitle = `${stamp()} — da reunião`;
  await login(page);
  await page.goto("/briefings");
  await page.getByRole("button", { name: /novo briefing/i }).first().click();

  const form = page.getByRole("dialog", { name: "Novo briefing" });
  await form.locator("#b-title").fill(title);
  await form.locator("#b-notes").fill("Anotações do teste.");
  await form.locator("#b-decisions").fill("Decisão do teste.");
  await form.getByRole("button", { name: /registrar briefing/i }).click();
  await expect(form).toBeHidden();

  // busca: acha pelas decisões (sem acento) e esconde com palavra inexistente
  await page.locator("#b-q").fill("decisao do teste");
  await expect(page.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  await page.locator("#b-q").fill("inexistente-xyz");
  await expect(page.getByText(/nenhum briefing com essa busca/i)).toBeVisible();
  await page.locator("#b-q").fill("");

  await page.getByRole("button", { name: new RegExp(title) }).click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet.getByText("Decisão do teste.")).toBeVisible();
  await sheet.getByRole("button", { name: /criar tarefa/i }).click();

  const taskForm = page.getByRole("dialog", { name: "Nova tarefa" });
  await expect(taskForm.locator("#task-client")).toHaveValue(""); // briefing interno → tarefa interna
  await taskForm.locator("#task-title").fill(taskTitle);
  await taskForm.getByRole("button", { name: /criar tarefa/i }).click();
  await expect(taskForm).toBeHidden();

  const back = page.getByRole("dialog", { name: title });
  await expect(back.getByRole("button", { name: new RegExp(taskTitle) })).toBeVisible();

  // limpeza: tarefa gerada, depois o briefing
  await back.getByRole("button", { name: new RegExp(taskTitle) }).click();
  const taskSheet = page.getByRole("dialog", { name: taskTitle });
  await expect(taskSheet.getByText(/gerada a partir do briefing/i)).toBeVisible();
  await taskSheet.getByRole("button", { name: "Excluir" }).click();
  await taskSheet.getByRole("button", { name: /confirmar exclusão/i }).click();
  await expect(page.getByRole("dialog", { name: taskTitle })).toBeHidden(); // espera a exclusão terminar
  await expect(page.getByRole("dialog", { name: title }).getByText(/nenhuma ainda/i)).toBeVisible();

  await page.goto("/briefings");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const final = page.getByRole("dialog", { name: title });
  await final.getByRole("button", { name: "Excluir" }).click();
  await final.getByRole("button", { name: /confirmar exclusão/i }).click();
  await expect(page.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
});
