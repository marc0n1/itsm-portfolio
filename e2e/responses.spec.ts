import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const stamp = Date.now();
const TICKET = `[e2e] Respostas prontas ${stamp}`;
const TITLE = `E2E Modelo ${stamp}`;
const BODY = "Olá, {{solicitante}}! Sobre o chamado #{{numero}}: já estamos analisando.\n\n{{agente}}";

async function withDb<T>(fn: (c: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const cleanup = () =>
  withDb(async (c) => {
    await c.query(`delete from "Ticket" where title like '[e2e] %'`);
    await c.query(`delete from "CannedResponse" where title like 'E2E %'`);
  });

test.beforeAll(cleanup);
test.afterAll(cleanup);
test.describe.configure({ mode: "serial" });

async function loginAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

let ticketUrl = "";
let number = "";

test("o solicitante abre um chamado e não tem acesso às respostas prontas nem aos textos", async ({
  page,
}) => {
  await loginAs(page, "solicitante@demo.com");
  await page.goto("/tickets/new?service=general");
  await page.getByLabel("Título").fill(TICKET);
  await page.getByLabel("Descrição").fill("Descrição de teste com mais de dez caracteres.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  ticketUrl = page.url();
  number = (await page.getByText(/^Chamado #\d+$/).innerText()).replace(/\D/g, "");

  // Sem o seletor e sem o texto dos modelos no HTML que chegou ao navegador.
  await expect(page.getByLabel("Inserir resposta pronta")).toHaveCount(0);
  expect(await page.content()).not.toContain("Pedido de mais informações");

  await expect(page.getByRole("link", { name: "Respostas" })).toHaveCount(0);
  await page.goto("/responses");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("a equipe cria um modelo; título repetido e variável desconhecida são recusados", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");
  await page.getByRole("link", { name: "Respostas" }).click();
  await expect(page).toHaveURL(/\/responses$/);
  // Os modelos de demonstração do seed estão lá.
  await expect(page.getByTestId("response-item").filter({ hasText: "Chamado resolvido" })).toBeVisible();

  const alert = page.locator("form p[role=alert]");

  // Variável com erro de digitação.
  await page.getByLabel("Título").fill(TITLE);
  await page.getByLabel("Texto").fill("Olá {{solicitnte}}");
  await page.getByRole("button", { name: "Criar resposta" }).click();
  await expect(alert).toContainText("Variável desconhecida");

  // Título que já existe (do seed).
  await page.getByLabel("Título").fill("Saudação");
  await page.getByLabel("Texto").fill("Qualquer texto");
  await page.getByRole("button", { name: "Criar resposta" }).click();
  await expect(alert).toContainText("Já existe uma resposta pronta com este título.");

  await page.getByLabel("Título").fill(TITLE);
  await page.getByLabel("Texto").fill(BODY);
  await page.getByRole("button", { name: "Criar resposta" }).click();
  await expect(page.getByRole("status")).toContainText("Resposta criada");
  await expect(page.getByTestId("response-item").filter({ hasText: TITLE })).toBeVisible();
  // O formulário volta limpo para o próximo modelo.
  await expect(page.getByLabel("Título")).toHaveValue("");
});

test("no chamado, escolher o modelo preenche as variáveis e respeita o rascunho", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");
  await page.goto(ticketUrl);

  const body = page.getByPlaceholder("Escreva um comentário...");
  const picker = page.getByLabel("Inserir resposta pronta");

  await picker.selectOption({ label: TITLE });
  await expect(body).toHaveValue(
    `Olá, Sara! Sobre o chamado #${number}: já estamos analisando.\n\nCarlos Agente`,
  );
  // O seletor volta ao título genérico (funciona como um menu de ações).
  await expect(picker).toHaveValue("");

  // Com texto já digitado, o modelo entra depois, separado por linha em branco.
  await body.fill("Rascunho meu.");
  await picker.selectOption({ label: TITLE });
  await expect(body).toHaveValue(
    `Rascunho meu.\n\nOlá, Sara! Sobre o chamado #${number}: já estamos analisando.\n\nCarlos Agente`,
  );

  // Dá para editar antes de enviar; o comentário é o texto final.
  await body.fill(`Olá, Sara! Chamado #${number} em análise, retorno hoje.`);
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText(`Chamado #${number} em análise, retorno hoje.`)).toBeVisible();
});

test("editar o modelo mantém o valor salvo; excluir não afeta comentários já enviados", async ({
  page,
}) => {
  await loginAs(page, "agente@demo.com");
  await page.goto("/responses");
  await page
    .getByTestId("response-item")
    .filter({ hasText: TITLE })
    .getByRole("link", { name: /Editar/ })
    .click();
  // Só então: "Texto" também existe no formulário "Nova resposta" da lista.
  await expect(page).toHaveURL(/\/responses\/[a-z0-9]+$/);

  await page.getByLabel("Texto").fill("Texto novo {{solicitante}}.");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Alterações salvas");
  await expect(page.getByLabel("Texto")).toHaveValue("Texto novo {{solicitante}}.");

  // Cancelar a confirmação não exclui.
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Excluir resposta" }).click();
  await expect(page).toHaveURL(/\/responses\/[a-z0-9]+$/);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir resposta" }).click();
  await expect(page).toHaveURL(/\/responses$/);
  await expect(page.getByTestId("response-item").filter({ hasText: TITLE })).toHaveCount(0);

  // O comentário enviado antes continua no chamado.
  await page.goto(ticketUrl);
  await expect(page.getByText(`Chamado #${number} em análise, retorno hoje.`)).toBeVisible();
  await expect(page.getByLabel("Inserir resposta pronta").locator("option", { hasText: TITLE })).toHaveCount(0);
});
