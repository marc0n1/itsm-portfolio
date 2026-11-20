import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const stamp = Date.now();
const REQUESTER_TICKET = `[e2e] Impressora travada ${stamp}`;
const AGENT_TICKET = `[e2e] Servidor lento ${stamp}`;

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Espera a sessão ser gravada antes de navegar (evita corrida com o proxy).
  if (password === PASSWORD) await expect(page).toHaveURL(/\/dashboard/);
}

async function openTicket(page: Page, title: string, priority?: string) {
  // "general" = chamado sem serviço (pula o catálogo).
  await page.goto("/tickets/new?service=general");
  await page.getByLabel("Título").fill(title);
  await page
    .getByLabel("Descrição")
    .fill("Descrição de teste com mais de dez caracteres.");
  if (priority) await page.getByLabel("Prioridade").selectOption(priority);
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return page.url();
}

test.describe.configure({ mode: "serial" });

// Limpa os chamados criados pelos testes (o banco é o de desenvolvimento).
test.afterAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`delete from "Ticket" where title like '[e2e] %'`);
  await client.end();
});

test("login com senha errada mostra erro e não entra", async ({ page }) => {
  await login(page, "agente@demo.com", "senha-errada");
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

let requesterTicketUrl = "";
let agentTicketUrl = "";

test("solicitante abre chamado e o vê em 'Meus chamados'", async ({ page }) => {
  await login(page, "solicitante@demo.com");
  await expect(page).toHaveURL(/\/dashboard/);

  // Solicitante não pode declarar prioridade crítica.
  await page.goto("/tickets/new?service=general");
  await expect(
    page.getByLabel("Prioridade").getByRole("option", { name: "Crítica" }),
  ).toHaveCount(0);

  requesterTicketUrl = await openTicket(page, REQUESTER_TICKET, "HIGH");
  await expect(page.getByText("Aberto", { exact: true }).first()).toBeVisible();

  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: "Meus chamados" })).toBeVisible();
  await expect(page.getByRole("link", { name: REQUESTER_TICKET })).toBeVisible();

  // Solicitante não vê o painel de atendimento.
  await page.goto(requesterTicketUrl);
  await expect(page.getByRole("heading", { name: "Atendimento" })).toHaveCount(0);
});

test("agente atende: assume, muda status e comenta (público e interno)", async ({
  page,
}) => {
  await login(page, "agente@demo.com");
  await page.goto("/tickets");
  await page.getByRole("link", { name: REQUESTER_TICKET }).click();

  const panel = page.locator("form", {
    has: page.getByRole("heading", { name: "Atendimento" }),
  });
  await panel.getByLabel("Status").selectOption("IN_PROGRESS");
  await panel.getByLabel("Responsável").selectOption({ label: "Carlos Agente" });
  await panel.getByRole("button", { name: "Salvar alterações" }).click();

  const details = page.locator("aside section").first();
  await expect(details.getByText("Carlos Agente")).toBeVisible();
  await expect(page.locator("header").getByText("Em andamento")).toBeVisible();

  await page.getByPlaceholder("Escreva um comentário...").fill("Já estamos verificando.");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Já estamos verificando.")).toBeVisible();

  await page.getByPlaceholder("Escreva um comentário...").fill("Suspeita: driver antigo.");
  await page.getByLabel(/Nota interna/).check();
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Suspeita: driver antigo.")).toBeVisible();
  await expect(page.getByText("Nota interna", { exact: true })).toBeVisible();
});

test("solicitante vê o comentário público, mas NÃO a nota interna", async ({
  page,
}) => {
  await login(page, "solicitante@demo.com");
  await page.goto(requesterTicketUrl);

  await expect(page.locator("header").getByText("Em andamento")).toBeVisible();
  await expect(page.getByText("Já estamos verificando.")).toBeVisible();
  await expect(page.getByText("Suspeita: driver antigo.")).toHaveCount(0);
  await expect(page.getByText("Nota interna", { exact: true })).toHaveCount(0);

  // Pode responder, e a resposta aparece.
  await page.getByPlaceholder("Escreva um comentário...").fill("Obrigada!");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Obrigada!")).toBeVisible();
  // Solicitante não tem a opção de nota interna.
  await expect(page.getByLabel(/Nota interna/)).toHaveCount(0);
});

test("isolamento: solicitante não vê nem acessa chamado de outra pessoa", async ({
  page,
}) => {
  await login(page, "agente@demo.com");
  agentTicketUrl = await openTicket(page, AGENT_TICKET, "CRITICAL");
  await page.goto("/tickets");
  await expect(page.getByRole("link", { name: AGENT_TICKET })).toBeVisible();
  await expect(page.getByRole("link", { name: REQUESTER_TICKET })).toBeVisible();

  // Mesmo chamado, agora como solicitante: some da lista e a URL dá 404.
  await page.context().clearCookies();
  await login(page, "solicitante@demo.com");
  await page.goto("/tickets");
  await expect(page.getByRole("link", { name: REQUESTER_TICKET })).toBeVisible();
  await expect(page.getByRole("link", { name: AGENT_TICKET })).toHaveCount(0);

  // Acesso direto pela URL: mostra "não encontrado" e NADA do chamado alheio
  // pode aparecer, nem no HTML bruto (inclui o payload RSC). Obs.: com streaming
  // o status HTTP já foi enviado como 200 antes da consulta terminar, então o
  // que se valida aqui é o conteúdo, não o código de status.
  const res = await page.goto(agentTicketUrl);
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
  await expect(page.getByText(AGENT_TICKET)).toHaveCount(0);
  expect(await res!.text()).not.toContain(AGENT_TICKET);
});

test("rotas protegidas redirecionam quem não está logado", async ({ page }) => {
  for (const path of ["/dashboard", "/tickets", "/tickets/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});
