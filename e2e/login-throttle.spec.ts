import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
// Contas só deste teste, para nunca travar o login dos outros specs.
const VICTIM = "solicitante@demo.com";
const RESETS = "admin@demo.com";
const UNKNOWN = `ninguem-${Date.now()}@demo.com`;

async function clearAttempts() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`delete from "LoginAttempt"`);
  await client.end();
}

test.beforeAll(clearAttempts);
test.afterAll(clearAttempts);
test.describe.configure({ mode: "serial" });

async function attempt(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("5 senhas erradas bloqueiam a conta, até a senha CERTA", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await attempt(page, VICTIM, "senha-errada");
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  }

  // 6ª tentativa, agora com a senha correta: continua bloqueado.
  await attempt(page, VICTIM, PASSWORD);
  await expect(page.getByText(/Muitas tentativas\. Tente novamente em \d+ minutos?\./)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("o bloqueio é por conta: outra conta continua entrando normalmente", async ({
  page,
}) => {
  await attempt(page, "agente@demo.com", PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("e-mail inexistente também é limitado, sem revelar se a conta existe", async ({
  page,
}) => {
  for (let i = 0; i < 5; i++) {
    await attempt(page, UNKNOWN, "qualquer");
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  }
  await attempt(page, UNKNOWN, "qualquer");
  // Mesma mensagem de bloqueio que uma conta real.
  await expect(page.getByText(/Muitas tentativas/)).toBeVisible();
});

test("entrar com sucesso zera as falhas anteriores", async ({ page }) => {
  for (let i = 0; i < 4; i++) {
    await attempt(page, RESETS, "senha-errada");
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  }
  await attempt(page, RESETS, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);

  // Sem o reset, a próxima falha seria a 5ª e o login seguinte já bloquearia.
  for (let i = 0; i < 4; i++) {
    await attempt(page, RESETS, "senha-errada");
    await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  }
  await attempt(page, RESETS, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
});
