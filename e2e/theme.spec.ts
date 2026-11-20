import { expect, test } from "@playwright/test";

// Regressão: com o sistema em modo escuro, o texto padrão ficava quase branco
// sobre as telas de fundo claro (ilegível). O app é só claro, então a cor do
// texto tem que continuar escura mesmo com prefers-color-scheme: dark.
test.use({ colorScheme: "dark" });

test("com o sistema em modo escuro, o texto continua legível (escuro)", async ({
  page,
}) => {
  await page.goto("/login");
  const h1 = page.getByRole("heading", { name: "Central de Chamados" });
  await expect(h1).toHaveCSS("color", "rgb(23, 23, 23)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});
