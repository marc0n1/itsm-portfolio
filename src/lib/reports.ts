import { z } from "zod";
import { Priority, TicketStatus } from "@/generated/prisma/enums";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/tickets";
import { computeSla, type ClockState, type SlaPolicy, type SlaTicket } from "@/lib/sla";
import type { CsvValue } from "@/lib/csv";

/** Teto de linhas por exportação: acima disso o usuário deve refinar o filtro. */
export const EXPORT_LIMIT = 10_000;

/** Valor do filtro de responsável para "chamados sem responsável". */
export const NO_ASSIGNEE = "none";

/**
 * Fuso do app (como em formatDate). O Brasil não tem horário de verão desde
 * 2019, então o deslocamento é fixo: -03:00.
 */
const TZ_OFFSET = "-03:00";

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

/** "YYYY-MM-DD" de um dia que EXISTE (recusa 2026-02-31), com a mensagem dada. */
const dateString = (message: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((s) => {
      const [y, m, d] = s.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      return (
        date.getUTCFullYear() === y &&
        date.getUTCMonth() === m - 1 &&
        date.getUTCDate() === d
      );
    }, message);

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

export const reportFiltersSchema = z
  .object({
    q: optional(z.string().trim().max(100, "A busca pode ter no máximo 100 caracteres.")),
    status: optional(z.enum(TicketStatus, { error: "Status inválido." })),
    priority: optional(z.enum(Priority, { error: "Prioridade inválida." })),
    // "none" (sem responsável) ou o id de um usuário.
    assignee: optional(z.string().min(1).max(64, "Responsável inválido.")),
    from: optional(dateString("Data inicial inválida.")),
    to: optional(dateString("Data final inválida.")),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    path: ["from"],
    message: "A data inicial não pode ser depois da final.",
  });

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/** Lê os filtros da URL e devolve a primeira mensagem de erro, se houver. */
export function parseReportFilters(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): { filters: ReportFilters } | { error: string } {
  const get = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const parsed = reportFiltersSchema.safeParse({
    q: get("q"),
    status: get("status"),
    priority: get("priority"),
    assignee: get("assignee"),
    from: get("from"),
    to: get("to"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Só as chaves preenchidas (o zod devolve as vazias como `undefined`).
  const filters = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  ) as ReportFilters;
  return { filters };
}

function nextDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Período em horário de Brasília, INCLUSIVO nas duas pontas: "de 01/03 até
 * 31/03" cobre os dois dias inteiros (limite superior exclusivo: dia seguinte 00h).
 */
export function dateRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00${TZ_OFFSET}`) } : {}),
    ...(to ? { lt: new Date(`${nextDay(to)}T00:00:00${TZ_OFFSET}`) } : {}),
  };
}

/** Querystring dos filtros ativos (para os links de download). */
export function reportQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "priority", "assignee", "from", "to"] as const) {
    const v = filters[key];
    if (v) params.set(key, v);
  }
  return params.toString();
}

const fileDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function reportFilename(filters: ReportFilters, now: Date): string {
  if (filters.from || filters.to) {
    return `chamados_${filters.from ?? "inicio"}_a_${filters.to ?? "hoje"}.csv`;
  }
  return `chamados_${fileDate.format(now)}.csv`;
}

// ---------------------------------------------------------------- linhas ---

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "dd/MM/yyyy HH:mm" fixo (não depende do ICU da máquina), que o Excel reconhece. */
export function csvDate(date: Date | null): string {
  if (!date) return "";
  const p = Object.fromEntries(dateTime.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const CLOCK_LABEL: Record<ClockState, string> = {
  ok: "No prazo",
  at_risk: "Em risco",
  breached: "Estourado",
  paused: "Pausado",
  met: "Cumprido",
  missed: "Não cumprido",
};

export const CSV_HEADERS = [
  "Nº",
  "Título",
  "Status",
  "Prioridade",
  "Serviço",
  "Solicitante",
  "Responsável",
  "Aberto em",
  "Primeira resposta em",
  "Resolvido em",
  "Minutos até a 1ª resposta",
  "Minutos para resolver (sem pausas)",
  "SLA 1ª resposta",
  "SLA resolução",
];

export type ReportTicket = SlaTicket & {
  number: number;
  title: string;
  service: { name: string } | null;
  requester: { name: string };
  assignee: { name: string } | null;
};

const minutesBetween = (a: Date, b: Date) =>
  Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

export function ticketCsvRow(
  t: ReportTicket,
  policy: SlaPolicy,
  now: Date,
): CsvValue[] {
  const sla = computeSla(t, policy, now);
  return [
    t.number,
    t.title,
    STATUS_LABEL[t.status],
    PRIORITY_LABEL[t.priority],
    t.service?.name ?? "",
    t.requester.name,
    t.assignee?.name ?? "",
    csvDate(t.createdAt),
    csvDate(t.firstResponseAt),
    csvDate(t.resolvedAt),
    t.firstResponseAt ? minutesBetween(t.createdAt, t.firstResponseAt) : null,
    // Tempo líquido: desconta o que o chamado ficou parado em "Aguardando".
    t.resolvedAt
      ? Math.max(0, minutesBetween(t.createdAt, t.resolvedAt) - Math.round(t.slaPausedSeconds / 60))
      : null,
    CLOCK_LABEL[sla.response.state],
    CLOCK_LABEL[sla.resolution.state],
  ];
}
