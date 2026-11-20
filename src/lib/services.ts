import { z } from "zod";
import { Priority } from "@/generated/prisma/enums";

export const FIELD_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  TEXT: "Texto curto",
  TEXTAREA: "Texto longo",
  NUMBER: "Número",
  DATE: "Data",
  SELECT: "Lista de opções",
};

const MAX_FIELDS = 15;

/** Definição de um campo do formulário de um serviço. */
export const fieldDefSchema = z
  .object({
    key: z.string().regex(/^[A-Za-z0-9_]{1,40}$/, "Identificador de campo inválido."),
    label: z
      .string()
      .trim()
      .min(1, "Todo campo precisa de um nome.")
      .max(80, "O nome do campo pode ter no máximo 80 caracteres."),
    type: z.enum(FIELD_TYPES, { error: "Tipo de campo inválido." }),
    required: z.boolean(),
    options: z
      .array(
        z.string().trim().min(1).max(60, "Cada opção pode ter no máximo 60 caracteres."),
      )
      .max(20, "No máximo 20 opções por campo.")
      .default([]),
  })
  .superRefine((f, ctx) => {
    if (f.type === "SELECT" && new Set(f.options).size < 2) {
      ctx.addIssue({
        code: "custom",
        message: `O campo "${f.label}" precisa de ao menos 2 opções diferentes.`,
      });
    }
  });

export type FieldDef = z.infer<typeof fieldDefSchema>;

export const serviceFieldsSchema = z
  .array(fieldDefSchema)
  .max(MAX_FIELDS, `No máximo ${MAX_FIELDS} campos por serviço.`)
  .refine(
    (fields) => new Set(fields.map((f) => f.key)).size === fields.length,
    "Há campos com identificador repetido.",
  );

export const serviceSchema = z.object({
  name: z
    .string({ error: "Informe o nome do serviço." })
    .trim()
    .min(3, "O nome precisa ter ao menos 3 caracteres.")
    .max(80, "O nome pode ter no máximo 80 caracteres."),
  description: z
    .string()
    .trim()
    .max(300, "A descrição pode ter no máximo 300 caracteres.")
    .default(""),
  defaultPriority: z.enum(Priority, { error: "Prioridade inválida." }),
  active: z.boolean(),
  fields: serviceFieldsSchema,
});

/** Lê o JSON salvo no banco; se estiver corrompido, devolve lista vazia. */
export function parseFields(json: unknown): FieldDef[] {
  const result = serviceFieldsSchema.safeParse(json);
  return result.success ? result.data : [];
}

/** Resposta salva no chamado (retrato do campo no momento do envio). */
export const answerSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(FIELD_TYPES),
  value: z.string(),
});
export type Answer = z.infer<typeof answerSchema>;

export function parseAnswers(json: unknown): Answer[] {
  const result = z.array(answerSchema).safeParse(json);
  return result.success ? result.data : [];
}

export const fieldInputName = (key: string) => `field_${key}`;

/**
 * Valida as respostas enviadas contra a definição do serviço. O servidor não
 * confia no navegador: obrigatoriedade, tipo e opções são rechecados aqui.
 */
export function buildAnswers(
  fields: FieldDef[],
  formData: FormData,
): { answers: Answer[]; error?: undefined } | { answers?: undefined; error: string } {
  const answers: Answer[] = [];

  for (const f of fields) {
    const raw = formData.get(fieldInputName(f.key));
    const value = typeof raw === "string" ? raw.trim() : "";

    if (!value) {
      if (f.required) return { error: `Preencha o campo "${f.label}".` };
      continue;
    }

    if (f.type === "NUMBER" && !Number.isFinite(Number(value))) {
      return { error: `O campo "${f.label}" precisa ser um número.` };
    }
    if (f.type === "DATE" && !isValidIsoDate(value)) {
      return { error: `O campo "${f.label}" precisa ser uma data válida.` };
    }
    if (f.type === "SELECT" && !f.options.includes(value)) {
      return { error: `Escolha uma opção válida em "${f.label}".` };
    }
    const max = f.type === "TEXTAREA" ? 2000 : 200;
    if (value.length > max) {
      return { error: `O campo "${f.label}" pode ter no máximo ${max} caracteres.` };
    }

    answers.push({ key: f.key, label: f.label, type: f.type, value });
  }

  return { answers };
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Texto para exibir uma resposta (datas em dd/mm/aaaa, sem fuso). */
export function displayAnswer(a: Answer) {
  if (a.type === "DATE") {
    const [y, m, d] = a.value.split("-");
    return `${d}/${m}/${y}`;
  }
  return a.value;
}
