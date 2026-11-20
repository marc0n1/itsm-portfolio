import type { TicketStatus } from "@/generated/prisma/enums";

/** Estados em que o chamado é considerado concluído. */
export function isDone(status: TicketStatus) {
  return status === "RESOLVED" || status === "CLOSED";
}

/**
 * Valor de `resolvedAt` ao mudar de status: preserva a data da primeira
 * resolução, define-a ao concluir e limpa ao reabrir.
 */
export function resolvedAtFor(status: TicketStatus, current: Date | null) {
  return isDone(status) ? (current ?? new Date()) : null;
}

/** Ordem de exibição por urgência (menor = mais urgente). */
export const PRIORITY_RANK = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
} as const;
