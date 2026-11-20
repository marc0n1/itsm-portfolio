import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const BASE = "http://localhost:3000";
const stamp = Date.now();
const NAME = `E2E Pessoa ${stamp}`;
const EMAIL = `e2e-${stamp}@demo.com`;
const NEW_PASSWORD = "outra-senha-99";
const TICKET = `[e2e] Responsável inativo ${stamp}`;

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
    await c.query(`delete from "Ticket" where title like '[e2e] %'`);
    await c.query(`delete from "LoginAttempt" where email like 'e2e-%'`);
    await c.query(`delete from "User" where email like 'e2e-%@demo.com'`);
  });
}

test.beforeAll(cleanup);
test.afterAll(cleanup);
test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string, password = PASSWORD) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function loginOk(page: Page, email: string, password = PASSWORD) {
  await login(page, email, password);
  await expect(page).toHaveURL(/\/dashboard/);
}

function row(page: Page, email: string) {
  return page.getByTestId("user-row").filter({ hasText: email });
}

test("só o administrador acessa a gestão de usuários", async ({ page }) => {
  for (const email of ["solicitante@demo.com", "agente@demo.com"]) {
    await loginOk(page, email);
    await expect(page.getByRole("link", { name: "Usuários" })).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/admin/users/new");
    await expect(page).toHaveURL(/\/dashboard/);
  }

  await loginOk(page, "admin@demo.com");
  await page.getByRole("link", { name: "Usuários" }).click();
  await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
  await expect(row(page, "admin@demo.com")).toContainText("(você)");
});

test("admin cria um usuário; e-mail repetido e senha longa demais são recusados", async ({
  page,
}) => {
  await loginOk(page, "admin@demo.com");
  await page.goto("/admin/users/new");

  const fill = async (email: string, password: string) => {
    await page.getByLabel("Nome").fill(NAME);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Perfil").selectOption("REQUESTER");
    await page.getByLabel("Senha inicial").fill(password);
    await page.getByRole("button", { name: "Criar usuário" }).click();
  };

  // Mais de 72 bytes: o servidor recusa (o bcrypt ignoraria o excesso).
  await fill(EMAIL, "a".repeat(80));
  await expect(page.locator("form p[role=alert]")).toContainText("no máximo 72");

  // E-mail já existente (do seed).
  await fill("agente@demo.com", PASSWORD + "x");
  await expect(page.locator("form p[role=alert]")).toContainText("Já existe um usuário");

  await fill(EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(row(page, EMAIL)).toContainText("Solicitante");
  await expect(row(page, EMAIL)).toContainText("Ativo");
});

test("o novo usuário entra; ao virar Agente, ganha acesso ao Quadro na hora", async ({
  page,
  browser,
}) => {
  const ctx = await browser.newContext({ baseURL: BASE });
  const user = await ctx.newPage();
  await loginOk(user, EMAIL);
  await expect(user.getByRole("link", { name: "Quadro" })).toHaveCount(0);

  await loginOk(page, "admin@demo.com");
  await page.goto("/admin/users");
  await row(page, EMAIL).getByRole("link", { name: /Editar/ }).click();
  await page.getByLabel("Perfil").selectOption("AGENT");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Alterações salvas");
  // O formulário mostra o valor salvo (não volta ao antigo).
  await expect(page.getByLabel("Perfil")).toHaveValue("AGENT");

  // O perfil vale já na próxima navegação do usuário, sem novo login.
  await user.goto("/dashboard");
  await expect(user.getByRole("link", { name: "Quadro" })).toBeVisible();
  await ctx.close();
});

test("desativar derruba a sessão aberta e impede novo login (mesma mensagem de senha errada)", async ({
  page,
  browser,
}) => {
  const ctx = await browser.newContext({ baseURL: BASE });
  const user = await ctx.newPage();
  await loginOk(user, EMAIL);

  await loginOk(page, "admin@demo.com");
  await page.goto("/admin/users");
  await row(page, EMAIL).getByRole("link", { name: /Editar/ }).click();
  await page.getByLabel(/Conta ativa/).uncheck();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Alterações salvas");

  // A sessão que já estava aberta cai na próxima requisição.
  await user.goto("/tickets");
  await expect(user).toHaveURL(/\/login/);
  await ctx.close();

  await login(page, EMAIL);
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();

  await loginOk(page, "admin@demo.com");
  await page.goto("/admin/users");
  await expect(row(page, EMAIL)).toContainText("Inativo");
});

test("usuário inativo some da lista de responsáveis", async ({ page }) => {
  await loginOk(page, "admin@demo.com");
  await page.goto("/tickets/new?service=general");
  await page.getByLabel("Título").fill(TICKET);
  await page.getByLabel("Descrição").fill("Descrição de teste com mais de dez caracteres.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);

  const options = page
    .locator("form", { has: page.getByRole("heading", { name: "Atendimento" }) })
    .getByLabel("Responsável")
    .locator("option");
  await expect(options.filter({ hasText: "Carlos Agente" })).toHaveCount(1);
  await expect(options.filter({ hasText: NAME })).toHaveCount(0);
});

test("reativar + redefinir a senha: a nova funciona e a antiga não", async ({ page }) => {
  await loginOk(page, "admin@demo.com");
  await page.goto("/admin/users");
  await row(page, EMAIL).getByRole("link", { name: /Editar/ }).click();

  await page.getByLabel(/Conta ativa/).check();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Alterações salvas");

  await page.getByLabel("Nova senha").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByText("Senha redefinida.")).toBeVisible();

  await login(page, EMAIL, PASSWORD);
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  await loginOk(page, EMAIL, NEW_PASSWORD);
});

test("o administrador não altera o próprio perfil nem se desativa", async ({ page }) => {
  await loginOk(page, "admin@demo.com");
  await page.goto("/admin/users");
  await row(page, "admin@demo.com").getByRole("link", { name: /Editar/ }).click();

  await expect(page.getByLabel("Perfil")).toBeDisabled();
  await expect(page.getByLabel(/Conta ativa/)).toBeDisabled();
  await expect(page.getByText("Você não pode alterar o seu próprio perfil")).toBeVisible();

  // Mas pode editar o próprio nome normalmente.
  const name = await page.getByLabel("Nome").inputValue();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Alterações salvas");
  await expect(page.getByLabel("Nome")).toHaveValue(name);
  await expect(page.getByLabel("Perfil")).toHaveValue("ADMIN");
});
