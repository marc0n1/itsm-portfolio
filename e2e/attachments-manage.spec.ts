import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const PASSWORD = "demo1234";
const TITLE = `[e2e] Gerir anexos ${Date.now()}`;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: Page, email: string) {
  await page.context().clearCookies();
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
let imageHref = "";
let notesHref = "";

test("solicitante abre chamado com imagem e texto; a imagem tem pré-visualização", async ({
  page,
}) => {
  await login(page, "solicitante@demo.com");
  await page.goto("/tickets/new?service=general");
  await page.getByLabel("Título").fill(TITLE);
  await page
    .getByLabel("Descrição")
    .fill("Descrição de teste com mais de dez caracteres.");
  await page.getByLabel(/Anexos/).setInputFiles([
    { name: "tela.png", mimeType: "image/png", buffer: PNG },
    { name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("olá") },
  ]);
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  ticketUrl = page.url();

  // A miniatura carrega de verdade (decodificou a imagem) e só a imagem tem uma.
  const thumbs = page.getByTestId("attachments").locator("li > button img");
  const thumb = thumbs.first();
  await expect(thumb).toBeVisible();
  await expect
    .poll(() => thumb.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await expect(thumbs).toHaveCount(1);

  // Clicar na miniatura abre a visualização ampliada.
  await page.getByRole("button", { name: "Ampliar tela.png" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.locator("img")).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  imageHref = (await page.getByRole("link", { name: /tela\.png/ }).getAttribute("href"))!;
  notesHref = (await page.getByRole("link", { name: /notas\.txt/ }).getAttribute("href"))!;
});

test("?inline=1 só vale para imagem; texto continua sendo download", async ({ page }) => {
  await login(page, "solicitante@demo.com");

  const img = await page.request.get(`${imageHref}?inline=1`);
  expect(img.headers()["content-disposition"]).toMatch(/^inline/);
  expect(img.headers()["content-type"]).toBe("image/png");
  expect(img.headers()["content-security-policy"]).toContain("default-src 'none'");

  const noInline = await page.request.get(imageHref);
  expect(noInline.headers()["content-disposition"]).toMatch(/^attachment/);

  const txt = await page.request.get(`${notesHref}?inline=1`);
  expect(txt.headers()["content-disposition"]).toMatch(/^attachment/);
});

test("cancelar a confirmação não remove nada", async ({ page }) => {
  await login(page, "solicitante@demo.com");
  await page.goto(ticketUrl);

  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Remover notas.txt" }).click();
  await expect(page.getByRole("link", { name: /notas\.txt/ })).toBeVisible();
  expect((await page.request.get(notesHref)).status()).toBe(200);
});

test("quem enviou remove o próprio anexo: some da tela, deixa de baixar e fica no histórico", async ({
  page,
}) => {
  await login(page, "solicitante@demo.com");
  await page.goto(ticketUrl);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remover notas.txt" }).click();
  await expect(page.getByRole("link", { name: /notas\.txt/ })).toHaveCount(0);
  // A imagem continua lá.
  await expect(page.getByRole("link", { name: /tela\.png/ })).toBeVisible();
  expect((await page.request.get(notesHref)).status()).toBe(404);

  // A equipe enxerga a remoção na trilha de auditoria.
  await login(page, "agente@demo.com");
  await page.goto(ticketUrl);
  await expect(page.getByTestId("history")).toContainText("Anexo removido: notas.txt");
  await expect(page.getByTestId("history")).toContainText("Sara Solicitante");
});

test("solicitante não remove anexo da equipe; a equipe remove o do solicitante", async ({
  page,
}) => {
  // Agente anexa em um comentário público.
  await login(page, "agente@demo.com");
  await page.goto(ticketUrl);
  await page.getByPlaceholder("Escreva um comentário...").fill("Veja o anexo.");
  await page.getByLabel(/Anexos/).setInputFiles({
    name: "agente.log",
    mimeType: "text/plain",
    buffer: Buffer.from("log"),
  });
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByRole("link", { name: /agente\.log/ })).toBeVisible();

  // Solicitante vê o arquivo, mas não tem o botão de remover (só no dele).
  await login(page, "solicitante@demo.com");
  await page.goto(ticketUrl);
  await expect(page.getByRole("link", { name: /agente\.log/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover agente.log" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remover tela.png" })).toBeVisible();

  // Agente remove o anexo (da imagem) enviado pelo solicitante.
  await login(page, "agente@demo.com");
  await page.goto(ticketUrl);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remover tela.png" }).click();
  await expect(page.getByRole("link", { name: /tela\.png/ })).toHaveCount(0);
  expect((await page.request.get(imageHref)).status()).toBe(404);
});
