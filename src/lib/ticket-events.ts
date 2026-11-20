import type { Priority, TicketStatus } from "@/generated/prisma/enums";

export type TicketSnapshot = {
  status: TicketStatus;
  priority: Priority;
  /** Nome do responsável (retrato legível), ou null se não houver. */
  assignee: string | null;
};

export type NewEvent = {
  type: "STATUS" | "PRIORITY" | "ASSIGNEE";
  from: string | null;
  to: string | null;
};

/** Compara o chamado antes/depois e devolve só o que de fato mudou. */
export function diffTicket(before: TicketSnapshot, after: TicketSnapshot): NewEvent[] {
  const events: NewEvent[] = [];
  if (before.status !== after.status) {
    events.push({ type: "STATUS", from: before.status, to: after.status });
  }
  if (before.priority !== after.priority) {
    events.push({ type: "PRIORITY", from: before.priority, to: after.priority });
  }
  if (before.assignee !== after.assignee) {
    events.push({ type: "ASSIGNEE", from: before.assignee, to: after.assignee });
  }
  return events;
}
