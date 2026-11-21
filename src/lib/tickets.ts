import { z } from "zod";
import { Priority, TicketStatus } from "@/generated/prisma/enums";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando",
  RESOLVED: "Resolvido",
  CLOSED: "Fechado",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  WAITING: "bg-purple-100 text-purple-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-zinc-200 text-zinc-700",
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: "bg-zinc-100 text-zinc-700",
  MEDIUM: "bg-sky-100 text-sky-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export const STATUSES = Object.values(TicketStatus);
export const PRIORITIES = Object.values(Priority);

/** Solicitantes não podem declarar um chamado como crítico. */
export const REQUESTER_PRIORITIES = PRIORITIES.filter((p) => p !== "CRITICAL");

const required = { error: "Campo obrigatório." };

export const createTicketSchema = z.object({
  title: z
    .string(required)
    .trim()
    .min(3, "O título precisa ter ao menos 3 caracteres.")
    .max(120, "O título pode ter no máximo 120 caracteres."),
  description: z
    .string(required)
    .trim()
    .min(10, "Descreva o problema com ao menos 10 caracteres.")
    .max(5000, "A descrição pode ter no máximo 5000 caracteres."),
  priority: z.enum(Priority, { error: "Prioridade inválida." }),
});

export const updateTicketSchema = z.object({
  ticketId: z.string(required).min(1),
  status: z.enum(TicketStatus, { error: "Status inválido." }),
  priority: z.enum(Priority, { error: "Prioridade inválida." }),
  assigneeId: z.string().optional(),
});

export const commentSchema = z.object({
  ticketId: z.string(required).min(1),
  body: z
    .string(required)
    .trim()
    .min(1, "Escreva um comentário.")
    .max(5000, "O comentário pode ter no máximo 5000 caracteres."),
  internal: z.string().optional(),
});

/** A coluna `number` é um inteiro de 32 bits com sinal no Postgres. */
const MAX_TICKET_NUMBER = 2_147_483_647;

/**
 * Se a busca for um número de chamado ("42" ou "#42"), devolve o número.
 * Número grande demais para a coluna (ex.: "99999999999") NÃO é número de
 * chamado: devolvê-lo ao banco estouraria o inteiro e daria erro 500.
 */
export function ticketNumberFromQuery(q: string): number | null {
  if (!/^#?\d+$/.test(q)) return null;
  const n = Number(q.replace("#", ""));
  return n >= 1 && n <= MAX_TICKET_NUMBER ? n : null;
}

/** Filtros da listagem, vindos da URL. Valores inválidos são ignorados. */
export const ticketFiltersSchema = z.object({
  status: z.enum(TicketStatus).optional().catch(undefined),
  priority: z.enum(Priority).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  mine: z.literal("1").optional().catch(undefined),
});

export type TicketFilters = z.infer<typeof ticketFiltersSchema>;

/**
 * Estado devolvido pelas Server Actions de formulário. O React 19 limpa os
 * campos após cada envio, então, em caso de erro, devolvemos os valores
 * digitados (`values`) para os campos serem repreenchidos.
 */
export type FormState =
  | { error?: string; values?: Record<string, string>; saved?: boolean }
  | undefined;

/** Valores de texto do formulário (ignora campos internos do React). */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION") && key !== "fields") {
      out[key] = value;
    }
  }
  return out;
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function formatDate(date: Date) {
  return dateFormat.format(date);
}
