import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const TITLE = `[e2e] Notificações ${Date.now()}`;

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function openBell(page: Page) {
  await page.getByRole("button", { name: /^Notificações/ }).click();
  const panel = page.getByTestId("notifications-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  // Notificações saem junto (ON DELETE CASCADE).
  await client.query(`delete from "Ticket" where title like '[e2e] %'`);
  await client.end();
});

let ticketUrl = "";
let n = "";

test("solicitante abre o chamado e não recebe aviso do que ele mesmo fez", async ({
  page,
}) => {
  await login(page, "solicitante@demo.com");
  await page.goto("/tickets/new?service=general");
  await page.getByLabel("Título").fill(TITLE);
  await page
    .getByLabel("Descrição")
    .fill("Descrição de teste com mais de dez caracteres.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  ticketUrl = page.url();
  n = (await page.getByText(/^Chamado #\d+$/).innerText()).replace(/\D/g, "");

  const panel = await openBell(page);
  await expect(panel).not.toContainText(n);
});

test("admin atribui e muda o status: avisa o responsável e o solicitante", async ({
  page,
}) => {
  await login(page, "admin@demo.com");
  await page.goto(ticketUrl);
  const form = page.locator("form", {
    has: page.getByRole("heading", { name: "Atendimento" }),
  });
  await form.getByLabel("Status").selectOption("IN_PROGRESS");
  await form.getByLabel("Responsável").selectOption({ label: "Carlos Agente" });
  await form.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByTestId("history")).toContainText("Responsável: ninguém → Carlos Agente");

  // Quem agiu não recebe aviso do próprio ato.
  const panel = await openBell(page);
  await expect(panel).not.toContainText(`#${n} foi atribuído`);
  await expect(panel).not.toContainText(`#${n} mudou`);
});

test("o responsável vê o aviso não lido; abrir marca como lido e leva ao chamado", async ({
  page,
}) => {
  await login(page, "agente@demo.com");
  const panel = await openBell(page);
  const item = panel.getByRole("button", { name: new RegExp(`Chamado #${n} foi atribuído a você`) });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("data-unread", "true");

  await item.click();
  await expect(page).toHaveURL(ticketUrl);
  // O painel fecha ao navegar; ao reabrir, o item já consta como lido.
  await expect(page.getByTestId("notifications-panel")).toHaveCount(0);
  const again = await openBell(page);
  await expect(
    again.getByRole("button", { name: new RegExp(`Chamado #${n} foi atribuído`) }),
  ).toHaveAttribute("data-unread", "false");
});

test("o solicitante recebe o aviso de mudança de status", async ({ page }) => {
  await login(page, "solicitante@demo.com");
  const panel = await openBell(page);
  const item = panel.getByRole("button", {
    name: new RegExp(`Chamado #${n} mudou para "Em andamento"`),
  });
  await expect(item).toHaveAttribute("data-unread", "true");
});

test("comentário público avisa o solicitante; nota interna NÃO", async ({ page }) => {
  // Agente (responsável) comenta em público e o admin deixa uma nota interna.
  await login(page, "agente@demo.com");
  await page.goto(ticketUrl);
  await page.getByPlaceholder("Escreva um comentário...").fill("Estamos analisando.");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Estamos analisando.")).toBeVisible();

  await login(page, "admin@demo.com");
  await page.goto(ticketUrl);
  await page.getByPlaceholder("Escreva um comentário...").fill("Suspeita interna.");
  await page.getByLabel(/Nota interna/).check();
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Suspeita interna.")).toBeVisible();

  await login(page, "solicitante@demo.com");
  const panel = await openBell(page);
  await expect(panel).toContainText(`Carlos Agente comentou no chamado #${n}`);
  await expect(panel).not.toContainText("nota interna");
});

test("o responsável é avisado da nota interna; 'marcar todas' vale só para quem clicou", async ({
  page,
}) => {
  await login(page, "agente@demo.com");
  let panel = await openBell(page);
  const note = panel.getByRole("button", {
    name: new RegExp(`Ana Admin deixou uma nota interna no chamado #${n}`),
  });
  await expect(note).toHaveAttribute("data-unread", "true");
  // O próprio comentário do agente não gera aviso para ele.
  await expect(panel).not.toContainText(`Carlos Agente comentou no chamado #${n}`);

  // Solicitante marca todas como lidas...
  await login(page, "solicitante@demo.com");
  panel = await openBell(page);
  await panel.getByRole("button", { name: "Marcar todas como lidas" }).click();
  await expect(page.getByTestId("unread-count")).toHaveCount(0);

  // ...e os avisos do agente continuam não lidos.
  await login(page, "agente@demo.com");
  panel = await openBell(page);
  await expect(
    panel.getByRole("button", { name: new RegExp(`nota interna no chamado #${n}`) }),
  ).toHaveAttribute("data-unread", "true");
});
