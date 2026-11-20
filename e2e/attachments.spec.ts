import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const stamp = Date.now();
const TITLE = `[e2e] Anexos ${stamp}`;

// PNG mínimo válido (1x1) e arquivos de apoio, tudo em memória.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

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

let ticketUrl = "";
let publicHref = "";
let internalHref = "";

test("solicitante abre chamado com anexo e o baixa de volta íntegro", async ({
  page,
}) => {
  await login(page, "solicitante@demo.com");
  await page.goto("/tickets/new?service=general");
  await page.getByLabel("Título").fill(TITLE);
  await page
    .getByLabel("Descrição")
    .fill("Descrição de teste com mais de dez caracteres.");
  await page
    .getByLabel(/Anexos/)
    .setInputFiles({ name: "tela.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  ticketUrl = page.url();

  const link = page.getByTestId("attachments").getByRole("link", { name: /tela\.png/ });
  await expect(link).toBeVisible();
  publicHref = (await link.getAttribute("href"))!;

  const res = await page.request.get(publicHref);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(Buffer.compare(await res.body(), PNG)).toBe(0);
});

test("o servidor recusa tipo proibido e conteúdo que não bate com a extensão", async ({
  page,
}) => {
  await login(page, "solicitante@demo.com");
  await page.goto(ticketUrl);

  const input = page.getByLabel(/Anexos/);
  const body = page.getByPlaceholder("Escreva um comentário...");

  // Extensão proibida (burla o atributo accept do input, que é só conveniência).
  await body.fill("com html");
  await input.setInputFiles({
    name: "x.html",
    mimeType: "text/html",
    buffer: Buffer.from("<script>alert(1)</script>"),
  });
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator("form p[role=alert]")).toContainText("tipo não permitido");
  // O texto digitado volta ao campo e nada foi publicado.
  await expect(body).toHaveValue("com html");
  await expect(page.getByText("Comentários (0)")).toBeVisible();

  // .png que na verdade é texto.
  await input.setInputFiles({
    name: "falso.png",
    mimeType: "image/png",
    buffer: Buffer.from("isso não é uma imagem"),
  });
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator("form p[role=alert]")).toContainText("não corresponde");

  // Acima do limite de 5 MB.
  await input.setInputFiles({
    name: "grande.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, "a"),
  });
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator("form p[role=alert]")).toContainText("limite de 5 MB");
});

test("agente anexa em comentário público e em nota interna", async ({ page }) => {
  await login(page, "agente@demo.com");
  await page.goto(ticketUrl);

  const body = page.getByPlaceholder("Escreva um comentário...");
  await body.fill("Segue o log.");
  await page
    .getByLabel(/Anexos/)
    .setInputFiles({ name: "publico.log", mimeType: "text/plain", buffer: Buffer.from("ok") });
  await page.getByRole("button", { name: "Comentar" }).click();
  const pub = page.getByRole("link", { name: /publico\.log/ });
  await expect(pub).toBeVisible();
  publicHref = (await pub.getAttribute("href"))!;

  await body.fill("Nota com dados sensíveis.");
  await page
    .getByLabel(/Anexos/)
    .setInputFiles({ name: "interno.txt", mimeType: "text/plain", buffer: Buffer.from("segredo") });
  await page.getByLabel(/Nota interna/).check();
  await page.getByRole("button", { name: "Comentar" }).click();
  const internal = page.getByRole("link", { name: /interno\.txt/ });
  await expect(internal).toBeVisible();
  internalHref = (await internal.getAttribute("href"))!;
});

test("anexo de nota interna não aparece nem baixa para o solicitante", async ({
  page,
}) => {
  await login(page, "solicitante@demo.com");
  await page.goto(ticketUrl);

  await expect(page.getByRole("link", { name: /publico\.log/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /interno\.txt/ })).toHaveCount(0);

  expect((await page.request.get(publicHref)).status()).toBe(200);
  expect((await page.request.get(internalHref)).status()).toBe(404);
});

test("sem login não baixa anexo", async ({ browser }) => {
  const ctx = await browser.newContext();
  const res = await ctx.request.get(new URL(publicHref, "http://localhost:3000").toString(), {
    maxRedirects: 0,
  });
  // O proxy redireciona quem não tem sessão para o login.
  expect([307, 308, 401, 404]).toContain(res.status());
  await ctx.close();
});
