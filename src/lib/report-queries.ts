import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/dal";
import { canWorkTickets } from "@/lib/permissions";
import { ticketNumberFromQuery } from "@/lib/tickets";
import { ticketScope } from "@/lib/ticket-queries";
import { NO_ASSIGNEE, dateRange, type ReportFilters } from "@/lib/reports";

/**
 * Filtros do relatório SOBRE o escopo de visibilidade do usuário: mesmo que
 * alguém informe o id de um responsável de outra organização, só entram
 * chamados da própria.
 */
function reportWhere(
  user: CurrentUser,
  f: ReportFilters,
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = { ...ticketScope(user) };

  if (f.status) where.status = f.status;
  if (f.priority) where.priority = f.priority;
  if (f.assignee) where.assigneeId = f.assignee === NO_ASSIGNEE ? null : f.assignee;

  const range = dateRange(f.from, f.to);
  if (range.gte || range.lt) where.createdAt = range;

  if (f.q) {
    const asNumber = ticketNumberFromQuery(f.q);
    where.OR = [
      { title: { contains: f.q, mode: "insensitive" } },
      ...(asNumber !== null ? [{ number: asNumber }] : []),
    ];
  }
  return where;
}

export function countReportTickets(user: CurrentUser, f: ReportFilters) {
  return prisma.ticket.count({ where: reportWhere(user, f) });
}

/** Em ordem cronológica (do mais antigo ao mais novo), que é a de um relatório. */
export function listReportTickets(user: CurrentUser, f: ReportFilters) {
  return prisma.ticket.findMany({
    where: reportWhere(user, f),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      number: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      slaPausedAt: true,
      slaPausedSeconds: true,
      csatScore: true,
      csatComment: true,
      service: { select: { name: true } },
      requester: { select: { name: true } },
      assignee: { select: { name: true } },
    },
  });
}

/**
 * Responsáveis possíveis no filtro. Inclui quem foi desativado: ele ainda pode
 * ter chamados atribuídos e o relatório precisa conseguir filtrá-los.
 */
export async function listReportAssignees(user: CurrentUser) {
  if (!canWorkTickets(user.role)) return [];
  return prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      role: { in: ["AGENT", "ADMIN"] },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, active: true },
  });
}
