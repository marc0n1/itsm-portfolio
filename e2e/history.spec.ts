import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const TITLE = `[e2e] Histórico ${Date.now()}`;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`delete from "Ticket" where title like '[e2e] %'`);
  await client.end();
});

let url = "";

test("solicitante abre o chamado e NÃO vê o histórico", async ({ page }) => {
  await login(page, "solicitante@demo.com");
  await page.goto("/tickets/new?service=general");
  await page.getByLabel("Título").fill(TITLE);
  await page
    .getByLabel("Descrição")
    .fill("Descrição de teste com mais de dez caracteres.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  url = page.url();

  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(page.getByTestId("history")).toHaveCount(0);
});

test("equipe vê a abertura e cada alteração registrada, com autor", async ({
  page,
}) => {
  await login(page, "agente@demo.com");
  await page.goto(url);

  const history = page.getByTestId("history");
  await expect(history.getByText("Chamado aberto")).toBeVisible();
  await expect(history.getByText("Sara Solicitante")).toBeVisible();

  const panel = page.locator("form", {
    has: page.getByRole("heading", { name: "Atendimento" }),
  });
  await panel.getByLabel("Status").selectOption("IN_PROGRESS");
  await panel.getByLabel("Prioridade").selectOption("HIGH");
  await panel.getByLabel("Responsável").selectOption({ label: "Carlos Agente" });
  await panel.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(history.getByText("Status: Aberto → Em andamento")).toBeVisible();
  await expect(history.getByText("Prioridade: Média → Alta")).toBeVisible();
  await expect(history.getByText("Responsável: ninguém → Carlos Agente")).toBeVisible();

  // Salvar sem mudar nada não gera evento novo.
  await expect(history.locator("li")).toHaveCount(4);
  // Sem recarregar: o formulário precisa manter os valores recém-salvos.
  await expect(panel.getByLabel("Status")).toHaveValue("IN_PROGRESS");
  await panel.getByRole("button", { name: "Salvar alterações" }).click();
  await page.reload();
  await expect(history.locator("li")).toHaveCount(4);
});
