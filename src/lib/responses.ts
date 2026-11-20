import { z } from "zod";

/** Variáveis aceitas nos modelos. O texto de ajuda aparece no formulário. */
export const PLACEHOLDERS = {
  solicitante: "primeiro nome do solicitante",
  numero: "número do chamado",
  agente: "seu nome",
} as const;

export type PlaceholderKey = keyof typeof PLACEHOLDERS;

const ALLOWED = new Set<string>(Object.keys(PLACEHOLDERS));
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_]\w*)\s*\}\}/g;

/** Variáveis do texto que NÃO existem (ex.: erro de digitação), sem repetição. */
export function unknownPlaceholders(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(PLACEHOLDER_RE)) {
    if (!ALLOWED.has(m[1])) found.add(m[1]);
  }
  return [...found];
}

/**
 * Substitui as variáveis pelos valores do chamado. Variável sem valor fica
 * como está, à vista de quem edita, em vez de sumir em silêncio.
 */
export function applyTemplate(
  body: string,
  vars: Partial<Record<PlaceholderKey, string>>,
): string {
  return body.replace(PLACEHOLDER_RE, (whole, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value !== undefined ? value : whole;
  });
}

/** Insere o texto ao fim do que já foi digitado, separado por uma linha em branco. */
export function appendToDraft(draft: string, text: string): string {
  if (!draft.trim()) return text;
  return `${draft.replace(/\s+$/, "")}\n\n${text}`;
}

/** Só o primeiro nome: "Sara Solicitante" => "Sara". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

const required = { error: "Campo obrigatório." };

export const responseSchema = z.object({
  title: z
    .string(required)
    .trim()
    .min(2, "O título precisa ter ao menos 2 caracteres.")
    .max(80, "O título pode ter no máximo 80 caracteres."),
  // Mesmo limite do comentário (5000): o texto inserido sempre cabe nele.
  body: z
    .string(required)
    .trim()
    .min(1, "Escreva o texto da resposta.")
    .max(5000, "O texto pode ter no máximo 5000 caracteres.")
    .refine((b) => unknownPlaceholders(b).length === 0, {
      message: "Variável desconhecida no texto. Use apenas as variáveis listadas.",
    }),
});

export const updateResponseSchema = responseSchema.extend({
  responseId: z.string(required).min(1),
});
