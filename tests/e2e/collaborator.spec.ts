import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { hideDevOverlay } from "./dev-overlay";

/**
 * Fluxos LOGADOS com o colaborador de teste (TEST_USER_EMAIL/PASSWORD no .env.local).
 * Cobre: login, navegação reorganizada, bloqueio da Administração, perfil (nome + foto) e saída.
 */
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
test.skip(!email || !password, "defina TEST_USER_EMAIL e TEST_USER_PASSWORD no .env.local");

const PHOTO = path.join(__dirname, "fixtures", "foto-sintetica.jpg");

async function login(page: Page) {
  await page.goto("/entrar");
  await page.locator("input[name=email]").fill(email!);
  await page.locator("input[name=password]").fill(password!);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

test.describe.configure({ mode: "serial" });
test.beforeEach(({ page }) => hideDevOverlay(page));

test("login → Início com saudação e nome real", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { level: 1, name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible();
  await expect(page.getByText("Minhas tarefas", { exact: false })).toBeVisible();
  await expect(page.getByText(/online agora/i)).toHaveCount(0); // sem presença fictícia
});

test("navegação: sem Administração para colaborador", async ({ page }) => {
  await login(page);
  if (isMobile(page)) {
    const bar = page.getByRole("navigation", { name: "Navegação principal" });
    await expect(bar.getByRole("link")).toHaveText(["Início", "Tarefas", "Briefings"]);
    await bar.getByRole("button", { name: "Mais" }).click();
    const sheet = page.getByRole("dialog", { name: "Mais opções" });
    await expect(sheet.getByRole("link")).toHaveText([/^Gravações/, /^Clientes/, /^Equipe/, /^Meu perfil/]); // cada item tem uma linha de contexto
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  } else {
    await expect(page.locator("aside").getByRole("link", { name: "Administração" })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: "Briefings" })).toBeVisible();
  }
  await page.goto("/admin");
  await expect(page.getByText(/não encontrada/i)).toBeVisible();
  await expect(page.getByText("Painel de")).toHaveCount(0);
});

test("convive com a faixa 'Powered by Netlify' (barra e menu acima dela)", async ({ page }) => {
  await login(page);
  // No site publicado a faixa é real; localmente simulamos o mesmo quadro (197×64, canto inferior direito).
  await page.evaluate(() => {
    if (document.getElementById("nl-badge-frame")) return;
    const f = document.createElement("iframe");
    f.id = "nl-badge-frame";
    f.title = "Powered by Netlify";
    f.style.cssText = "position:fixed;right:0;bottom:0;width:197px;height:64px;border:0;z-index:2147483645;background:#fff";
    document.body.appendChild(f);
  });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--badge-h").trim())).toBe("64px");

  if (isMobile(page)) {
    const bar = page.getByRole("navigation", { name: "Navegação principal" });
    const barBox = (await bar.boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(barBox.y + barBox.height, "barra inferior acima da faixa").toBeLessThanOrEqual(vh - 64);
    await bar.getByRole("button", { name: "Mais" }).click(); // falharia se a faixa cobrisse o botão
    const sheet = page.getByRole("dialog", { name: "Mais opções" });
    await expect(sheet.getByRole("button", { name: /sair do workspace/i })).toBeVisible();
    await sheet.getByRole("link", { name: "Meu perfil" }).click();
    await expect(page).toHaveURL(/\/perfil/);
  }
});

test("clientes: colaborador vê a página, mas não cadastra", async ({ page }) => {
  await login(page);
  await page.goto("/clientes");
  await expect(page.getByRole("heading", { level: 1, name: /nossos clientes/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /novo cliente/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /cadastrar primeiro cliente/i })).toHaveCount(0);
});

test("todas as telas abrem sem rolagem lateral", async ({ page }) => {
  await login(page);
  for (const p of ["/dashboard", "/tarefas", "/briefings", "/clientes", "/equipe", "/perfil"]) {
    await page.goto(p);
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, `rolagem lateral em ${p}`).toBe(false);
  }
});

test("Meu perfil: e-mail só para a própria pessoa; funções e nível só leitura", async ({ page }) => {
  await login(page);
  await page.goto("/perfil");
  await expect(page.getByText("E-mail de login")).toBeVisible();
  await expect(page.getByText("Definido pela administração.")).toBeVisible();
  await expect(page.getByText("Definidas pela administração.")).toBeVisible();
  await expect(page.locator("select, input[name=access_level], input[name=roles]")).toHaveCount(0);
  await page.goto("/equipe");
  await expect(page.locator("main")).not.toContainText("@");
});

test("Meu perfil: nome de exibição persiste após recarregar", async ({ page }) => {
  await login(page);
  await page.goto("/perfil");
  const input = page.locator("#full_name");
  const original = await input.inputValue();
  const temp = `${original.split(" ")[0]} E2E`;

  await input.fill(temp);
  await page.getByRole("button", { name: /salvar alterações/i }).click();
  await expect(page.getByText("Perfil salvo.")).toBeVisible();
  await page.reload();
  await expect(page.locator("#full_name")).toHaveValue(temp);

  await page.locator("#full_name").fill(original); // restaura
  await page.getByRole("button", { name: /salvar alterações/i }).click();
  await expect(page.getByText("Perfil salvo.")).toBeVisible();
});

test("Meu perfil: enviar foto (recorte) e remover", async ({ page }) => {
  await login(page);
  await page.goto("/perfil");
  await page.locator("input[type=file]").setInputFiles(PHOTO);
  const dialog = page.getByRole("dialog", { name: "Ajustar foto" });
  await expect(dialog.locator("img")).toBeVisible();
  await dialog.getByRole("button", { name: "Aumentar zoom" }).click();
  await dialog.getByRole("button", { name: /salvar foto/i }).click();
  await expect(page.getByText("Foto atualizada.")).toBeVisible();

  await page.reload();
  const avatar = page.locator("main img[src^='/avatar/']").first();
  await expect(avatar).toBeVisible();
  const res = await page.request.get((await avatar.getAttribute("src"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/image\/(webp|jpeg)/);
  expect(res.headers()["cache-control"]).toContain("private");

  await page.getByRole("button", { name: "Remover" }).click();
  await expect(page.getByText("Foto removida.")).toBeVisible();
  await page.reload();
  await expect(page.locator("main img[src^='/avatar/']")).toHaveCount(0);
});

test("sair encerra a sessão", async ({ page }) => {
  await login(page);
  await page.goto("/perfil");
  await page.locator("main").getByRole("button", { name: /sair do workspace/i }).click();
  await expect(page).toHaveURL(/motivo=saiu/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/entrar/);
});
