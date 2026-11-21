import { z } from "zod";
import type { TicketStatus } from "@/generated/prisma/enums";
import { isDone } from "@/lib/ticket-status";

export const SCORES = [1, 2, 3, 4, 5] as const;

export const SCORE_LABEL: Record<(typeof SCORES)[number], string> = {
  1: "Muito insatisfeito",
  2: "Insatisfeito",
  3: "Neutro",
  4: "Satisfeito",
  5: "Muito satisfeito",
};

/** "★★★★☆": a nota em estrelas (o número também aparece, nunca só o símbolo). */
export function stars(score: number): string {
  const n = Math.min(5, Math.max(0, Math.round(score)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

const required = { error: "Campo obrigatório." };

export const ratingSchema = z.object({
  ticketId: z.string(required).min(1),
  // Vem do formulário como texto ("4"): só inteiros de 1 a 5.
  score: z
    .string({ error: "Escolha uma nota de 1 a 5." })
    .regex(/^[1-5]$/, "Escolha uma nota de 1 a 5.")
    .transform(Number),
  comment: z
    .string()
    .trim()
    .max(1000, "O comentário pode ter no máximo 1000 caracteres.")
    .optional()
    // Campo em branco = sem comentário.
    .transform((c) => (c ? c : null)),
});

/**
 * Só o solicitante do chamado avalia, e só depois de concluído: nem a equipe
 * (que seria juiz do próprio trabalho) nem outro solicitante.
 */
export function canRate(
  ticket: { status: TicketStatus; requesterId: string },
  userId: string,
): boolean {
  return ticket.requesterId === userId && isDone(ticket.status);
}

export type CsatTicket = { resolvedAt: Date | null; csatScore: number | null };

export type CsatSummary = {
  /** Chamados concluídos na janela (base da taxa de resposta). */
  concluded: number;
  rated: number;
  /** Nota média com 1 casa decimal; null sem avaliações. */
  average: number | null;
  /** % de notas 4 e 5 (a definição usual de CSAT); null sem avaliações. */
  satisfiedPct: number | null;
  /** % dos concluídos que foram avaliados; null sem concluídos. */
  responseRatePct: number | null;
  /** Contagem por nota, índice 0 = nota 1. */
  distribution: [number, number, number, number, number];
};

/**
 * Resumo da satisfação dos chamados concluídos nos últimos `windowDays` dias
 * (mesma janela do SLA: por data de resolução).
 */
export function summarizeCsat(
  tickets: CsatTicket[],
  now: Date,
  windowDays = 30,
): CsatSummary {
  const since = now.getTime() - windowDays * 86_400_000;
  const distribution: CsatSummary["distribution"] = [0, 0, 0, 0, 0];
  let concluded = 0;
  let rated = 0;
  let sum = 0;

  for (const t of tickets) {
    if (!t.resolvedAt || t.resolvedAt.getTime() < since) continue;
    concluded++;
    if (t.csatScore === null) continue;
    rated++;
    sum += t.csatScore;
    distribution[t.csatScore - 1]++;
  }

  const pct = (part: number, whole: number) => Math.round((part / whole) * 100);
  return {
    concluded,
    rated,
    average: rated ? Math.round((sum / rated) * 10) / 10 : null,
    satisfiedPct: rated ? pct(distribution[3] + distribution[4], rated) : null,
    responseRatePct: concluded ? pct(rated, concluded) : null,
    distribution,
  };
}
