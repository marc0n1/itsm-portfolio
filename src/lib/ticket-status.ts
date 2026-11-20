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

export type StatusState = {
  resolvedAt: Date | null;
  slaPausedAt: Date | null;
  slaPausedSeconds: number;
};

/**
 * Campos a gravar ao mudar o status de um chamado. Concentra as regras que o
 * painel de atendimento e o Kanban compartilham:
 * - resolvedAt: define ao concluir, preserva a 1ª data, limpa ao reabrir;
 * - SLA: entrar em "Aguardando" pausa o relógio; sair dele soma o tempo
 *   parado a slaPausedSeconds (o que empurra o prazo de resolução).
 */
export function statusTransition(
  current: StatusState,
  next: TicketStatus,
  now: Date = new Date(),
) {
  const data: {
    status: TicketStatus;
    resolvedAt: Date | null;
    slaPausedAt?: Date | null;
    slaPausedSeconds?: number;
  } = {
    status: next,
    resolvedAt: resolvedAtFor(next, current.resolvedAt),
  };

  const wasPaused = current.slaPausedAt !== null;
  const willPause = next === "WAITING";

  if (willPause && !wasPaused) {
    data.slaPausedAt = now;
  } else if (!willPause && wasPaused) {
    const pausedMs = now.getTime() - current.slaPausedAt!.getTime();
    data.slaPausedSeconds =
      current.slaPausedSeconds + Math.max(0, Math.round(pausedMs / 1000));
    data.slaPausedAt = null;
  }

  return data;
}

/** Ordem de exibição por urgência (menor = mais urgente). */
export const PRIORITY_RANK = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
} as const;
