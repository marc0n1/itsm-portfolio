import "dotenv/config";
import bcrypt from "bcryptjs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";

const BASE = "http://localhost:3000";
const stamp = Date.now();
const EMAIL = `e2e-conta-${stamp}@demo.com`;
const START = "senha-inicial-1";
const NEXT = "senha-nova-2222";
const ADMIN_PASSWORD = "demo1234";

async function withDb<T>(fn: (c: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function cleanup() {
  await withDb(async (c) => {
    await c.query(`delete from "LoginAttempt" where email like 'e2e-%'`);
    await c.query(`delete from "User" where email like 'e2e-%@demo.com'`);
  });
}

// Usuário só deste spec: nunca mexemos na senha das contas de demonstração.
async function seedUser() {
  const hash = await bcrypt.hash(START, 10);
  await withDb((c) =>
    c.query(
      `insert into "User" (id, "organizationId", name, email, "passwordHash", role)
       select 'e2e' || md5(random()::text), "organizationId", 'Conta Teste', $1, $2, 'AGENT'
       from "User" where email = 'admin@demo.com'`,
      [EMAIL, hash],
    ),
  );
}

test.beforeAll(async () => {
  await cleanup();
  await seedUser();
});
test.afterAll(cleanup);
test.describe.configure({ mode: "serial" });

let password = START;

async function login(page: Page, email: string, pass: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(pass);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function loginOk(page: Page, email: string, pass: string) {
  await login(page, email, pass);
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Uma "segunda aba/aparelho": contexto novo, logado como o usuário. */
async function otherDevice(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await loginOk(page, EMAIL, password);
  return { ctx, page };
}

async function fillPasswords(page: Page, current: string, next: string, confirm = next) {
  await page.getByLabel("Senha atual").fill(current);
  await page.getByLabel("Nova senha", { exact: true }).fill(next);
  await page.getByLabel("Confirmar nova senha").fill(confirm);
  // Espera a Server Action terminar. Sem isso, o alerta da tentativa anterior
  // (mesmo texto) passaria na checagem e a próxima tentativa seria preenchida
  // antes de o React limpar o formulário, saindo vazia.
  const done = page.waitForResponse((r) => r.request().method() === "POST");
  await page.getByRole("button", { name: "Alterar senha" }).click();
  await done;
  await expect(page.getByLabel("Senha atual")).toHaveValue("");
}

test("a página exige login e o nome no cabeçalho leva até ela", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);

  await loginOk(page, EMAIL, password);
  await page.getByRole("link", { name: "Minha conta" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Minha conta" })).toBeVisible();
  const info = page.locator("dl");
  await expect(info).toContainText(EMAIL);
  await expect(info).toContainText("Agente");
});

test("trocar o nome atualiza o cabeçalho", async ({ page }) => {
  await loginOk(page, EMAIL, password);
  await page.goto("/account");
  await page.getByLabel("Nome").fill("Conta Renomeada");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByRole("status")).toContainText("Nome atualizado");
  await expect(page.getByLabel("Nome")).toHaveValue("Conta Renomeada");
  await expect(page.getByRole("link", { name: "Minha conta" })).toContainText("Conta Renomeada");
});

test("a troca de senha valida a senha atual, a confirmação e a novidade da nova", async ({
  page,
}) => {
  await loginOk(page, EMAIL, password);
  await page.goto("/account");
  const alert = page.locator("form p[role=alert]");

  await fillPasswords(page, "senha-errada-x", NEXT);
  await expect(alert).toContainText("A senha atual está incorreta.");

  await fillPasswords(page, password, NEXT, "diferente-1234");
  await expect(alert).toContainText("confirmação");

  await fillPasswords(page, password, password);
  await expect(alert).toContainText("diferente da atual");
});

test("trocar a senha encerra as OUTRAS sessões; esta continua; só a nova senha entra", async ({
  page,
  browser,
}) => {
  const other = await otherDevice(browser);

  await loginOk(page, EMAIL, password);
  await page.goto("/account");
  await fillPasswords(page, password, NEXT);
  await expect(page.getByRole("status")).toContainText("Senha alterada");

  // Quem trocou continua logado...
  await page.goto("/tickets");
  await expect(page).toHaveURL(/\/tickets$/);

  // ...e o outro aparelho cai no login (sem loop de redirecionamento).
  await other.page.goto("/tickets");
  await expect(other.page).toHaveURL(/\/login$/);
  await other.ctx.close();

  await login(page, EMAIL, password);
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  password = NEXT;
  await loginOk(page, EMAIL, password);
});

test("o admin redefinir a senha também derruba as sessões abertas da pessoa", async ({
  page,
  browser,
}) => {
  const other = await otherDevice(browser);

  await loginOk(page, "admin@demo.com", ADMIN_PASSWORD);
  await page.goto("/admin/users");
  await page
    .getByTestId("user-row")
    .filter({ hasText: EMAIL })
    .getByRole("link", { name: /Editar/ })
    .click();
  await page.getByLabel("Nova senha").fill("redefinida-por-admin-3");
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByText("Senha redefinida.")).toBeVisible();
  password = "redefinida-por-admin-3";

  await other.page.goto("/tickets");
  await expect(other.page).toHaveURL(/\/login$/);
  await other.ctx.close();
});

test("errar a senha atual repetidamente bloqueia, até com a senha certa", async ({ page }) => {
  await loginOk(page, EMAIL, password);
  await page.goto("/account");
  const alert = page.locator("form p[role=alert]");

  for (let i = 0; i < 5; i++) {
    await fillPasswords(page, "errada-errada-1", NEXT);
    await expect(alert).toContainText("A senha atual está incorreta.");
  }
  await fillPasswords(page, password, NEXT);
  await expect(alert).toContainText("Muitas tentativas");
});
