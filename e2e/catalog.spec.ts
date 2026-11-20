import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const stamp = Date.now();
const SERVICE = `[e2e] Acesso VPN ${stamp}`;
const TICKET = `[e2e] Pedido de VPN ${stamp}`;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function logout(page: Page) {
  await page.context().clearCookies();
}

async function addField(
  page: Page,
  index: number,
  f: { label: string; type: string; required?: boolean; options?: string },
) {
  await page.getByRole("button", { name: "Adicionar campo" }).click();
  const row = page.getByTestId("field-row").nth(index);
  await row.getByLabel("Nome do campo").fill(f.label);
  await row.getByLabel("Tipo do campo").selectOption(f.type);
  if (f.options) await row.getByLabel("Opções (uma por linha)").fill(f.options);
  if (f.required) await row.getByLabel("Obrigatório").check();
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`delete from "Ticket" where title like '[e2e] %'`);
  await client.query(`delete from "Service" where name like '[e2e] %'`);
  await client.end();
});

let serviceId = "";
let ticketUrl = "";

test("solicitante não acessa a administração do catálogo", async ({ page }) => {
  await login(page, "solicitante@demo.com");
  await expect(page.getByRole("link", { name: "Serviços" })).toHaveCount(0);

  for (const path of ["/admin/services", "/admin/services/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard/);
  }
});

test("agente também não acessa a administração do catálogo", async ({ page }) => {
  await login(page, "agente@demo.com");
  await page.goto("/admin/services");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("admin: o servidor recusa lista de opções com menos de 2 itens", async ({
  page,
}) => {
  await login(page, "admin@demo.com");
  await page.getByRole("link", { name: "Serviços" }).click();
  await page.getByRole("link", { name: "Novo serviço" }).click();

  await page.getByLabel("Nome do serviço").fill(`[e2e] Inválido ${stamp}`);
  await addField(page, 0, { label: "Sistema", type: "SELECT", options: "ERP" });
  await page.getByRole("button", { name: "Salvar serviço" }).click();

  await expect(page.getByText(/precisa de ao menos 2 opções/)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/services\/new/);

  // Após o erro, nada do que foi digitado pode ser perdido.
  await expect(page.getByLabel("Nome do serviço")).toHaveValue(`[e2e] Inválido ${stamp}`);
  await expect(page.getByLabel("Nome do campo")).toHaveValue("Sistema");
});

test("admin cria um serviço com formulário dinâmico", async ({ page }) => {
  await login(page, "admin@demo.com");
  await page.goto("/admin/services/new");

  await page.getByLabel("Nome do serviço").fill(SERVICE);
  await page.getByLabel("Descrição").fill("Pedido de acesso à VPN corporativa");
  await addField(page, 0, {
    label: "Sistema",
    type: "SELECT",
    required: true,
    options: "ERP\nCRM",
  });
  await addField(page, 1, { label: "Quantidade", type: "NUMBER", required: true });
  await addField(page, 2, { label: "Observações", type: "TEXTAREA" });
  await page.getByRole("button", { name: "Salvar serviço" }).click();

  await expect(page).toHaveURL(/\/admin\/services$/);
  const row = page.getByRole("row", { name: SERVICE });
  await expect(row).toBeVisible();
  await expect(row.getByText("Ativo", { exact: true })).toBeVisible();
});

test("solicitante vê o serviço no catálogo e o servidor valida o formulário", async ({
  page,
}) => {
  await login(page, "solicitante@demo.com");
  await page.goto("/tickets/new");

  const card = page.getByRole("link", { name: SERVICE });
  await expect(card).toBeVisible();
  serviceId = (await card.getAttribute("href"))!.split("service=")[1];
  await card.click();

  await expect(page.getByText(`Informações de ${SERVICE}`)).toBeVisible();
  await page.getByLabel("Título").fill(TICKET);
  await page.getByLabel("Descrição").fill("Preciso de acesso à VPN para trabalhar de casa.");

  // Remove os "required" do HTML para provar que o SERVIDOR também valida.
  await page.evaluate(() =>
    document.querySelectorAll("[required]").forEach((e) => e.removeAttribute("required")),
  );
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page.getByText('Preencha o campo "Sistema".')).toBeVisible();

  // Valor fora das opções (adulterando o <option>) também é recusado.
  await page.getByLabel("Sistema").evaluate((el: HTMLSelectElement) => {
    const opt = document.createElement("option");
    opt.value = "Hackeado";
    opt.textContent = "Hackeado";
    el.appendChild(opt);
    el.value = "Hackeado";
  });
  await page.getByLabel("Quantidade").fill("3");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page.getByText('Escolha uma opção válida em "Sistema".')).toBeVisible();

  // Agora preenchido corretamente.
  await page.getByLabel("Sistema").selectOption("ERP");
  await page.getByRole("button", { name: "Abrir chamado" }).click();

  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  ticketUrl = page.url();
  const info = page.locator("section", {
    has: page.getByRole("heading", { name: /Informações do serviço/ }),
  });
  await expect(info.getByText("Sistema")).toBeVisible();
  await expect(info.getByText("ERP", { exact: true })).toBeVisible();
  await expect(info.getByText("Quantidade")).toBeVisible();
  await expect(info.getByText("3", { exact: true })).toBeVisible();
  // Campo opcional não preenchido não aparece.
  await expect(info.getByText("Observações")).toHaveCount(0);
});

test("agente vê as respostas do formulário no chamado", async ({ page }) => {
  await login(page, "agente@demo.com");
  await page.goto(ticketUrl);
  await expect(page.getByRole("heading", { name: TICKET })).toBeVisible();
  await expect(page.getByText("ERP", { exact: true })).toBeVisible();
  await expect(page.getByText(`· ${SERVICE}`)).toBeVisible();
});

test("serviço desativado sai do catálogo e não aceita novos chamados", async ({
  page,
}) => {
  await login(page, "admin@demo.com");
  await page.goto("/admin/services");
  const row = page.getByRole("row", { name: SERVICE });
  await row.getByRole("button", { name: "Desativar" }).click();
  await expect(row.getByText("Inativo", { exact: true })).toBeVisible();

  await logout(page);
  await login(page, "solicitante@demo.com");
  await page.goto("/tickets/new");
  await expect(page.getByRole("link", { name: SERVICE })).toHaveCount(0);

  // URL direta do serviço inativo: "não encontrado", e o chamado antigo segue visível.
  await page.goto(`/tickets/new?service=${serviceId}`);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();

  await page.goto(ticketUrl);
  await expect(page.getByRole("heading", { name: TICKET })).toBeVisible();
});
