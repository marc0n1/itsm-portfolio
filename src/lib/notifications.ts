/**
 * Regras puras de "quem é avisado de quê". Sem I/O: recebem os fatos e
 * devolvem as notificações a criar. Quem age NUNCA é notificado.
 */

export type NotificationKind = "ASSIGNED" | "COMMENT" | "STATUS" | "RATING";

export type PlannedNotification = {
  userId: string;
  type: NotificationKind;
  message: string;
};

/** Remove o autor da ação e duplicatas (mesma pessoa em dois papéis). */
function dedupe(
  actorId: string,
  items: (PlannedNotification | null)[],
): PlannedNotification[] {
  const seen = new Set<string>([actorId]);
  const out: PlannedNotification[] = [];
  for (const item of items) {
    if (!item || seen.has(item.userId)) continue;
    seen.add(item.userId);
    out.push(item);
  }
  return out;
}

/** Chamado atribuído a alguém: só o novo responsável é avisado. */
export function planAssignment(input: {
  actorId: string;
  newAssigneeId: string | null;
  number: number;
  title: string;
}): PlannedNotification[] {
  if (!input.newAssigneeId) return [];
  return dedupe(input.actorId, [
    {
      userId: input.newAssigneeId,
      type: "ASSIGNED",
      message: `Chamado #${input.number} foi atribuído a você: ${input.title}`,
    },
  ]);
}

/** Mudança de status: o solicitante acompanha o andamento. */
export function planStatusChange(input: {
  actorId: string;
  requesterId: string;
  number: number;
  toLabel: string;
}): PlannedNotification[] {
  return dedupe(input.actorId, [
    {
      userId: input.requesterId,
      type: "STATUS",
      message: `Chamado #${input.number} mudou para "${input.toLabel}"`,
    },
  ]);
}

/**
 * Novo comentário.
 * - Nota interna: só o responsável (equipe) é avisado; o solicitante nunca.
 * - Comentário público: o solicitante e o responsável, exceto quem escreveu.
 */
export function planComment(input: {
  actorId: string;
  authorName: string;
  requesterId: string;
  assigneeId: string | null;
  internal: boolean;
  number: number;
}): PlannedNotification[] {
  const note = (userId: string): PlannedNotification => ({
    userId,
    type: "COMMENT",
    message: input.internal
      ? `${input.authorName} deixou uma nota interna no chamado #${input.number}`
      : `${input.authorName} comentou no chamado #${input.number}`,
  });

  return dedupe(input.actorId, [
    input.internal ? null : note(input.requesterId),
    input.assigneeId ? note(input.assigneeId) : null,
  ]);
}

/** Avaliação (CSAT): quem atende o chamado fica sabendo do que o cliente achou. */
export function planRating(input: {
  actorId: string;
  authorName: string;
  assigneeId: string | null;
  number: number;
  score: number;
  /** Já havia avaliação antes (o solicitante mudou de ideia). */
  isUpdate: boolean;
}): PlannedNotification[] {
  if (!input.assigneeId) return [];
  const verb = input.isUpdate ? "alterou a avaliação do" : "avaliou o";
  return dedupe(input.actorId, [
    {
      userId: input.assigneeId,
      type: "RATING",
      message: `${input.authorName} ${verb} chamado #${input.number}: ${input.score} de 5`,
    },
  ]);
}
