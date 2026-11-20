import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/dal";
import { canWorkTickets } from "@/lib/permissions";
import type { TicketFilters } from "@/lib/tickets";

/**
 * Escopo de visibilidade, aplicado em TODA consulta de chamados:
 * - sempre restrito à organização do usuário (isolamento entre empresas);
 * - solicitantes só enxergam os chamados que abriram.
 */
export function ticketScope(user: CurrentUser): Prisma.TicketWhereInput {
  return {
    organizationId: user.organizationId,
    ...(user.role === "REQUESTER" ? { requesterId: user.id } : {}),
  };
}

export async function listTickets(user: CurrentUser, filters: TicketFilters) {
  const where: Prisma.TicketWhereInput = { ...ticketScope(user) };

  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.mine && canWorkTickets(user.role)) where.assigneeId = user.id;

  if (filters.q) {
    const asNumber = /^#?\d+$/.test(filters.q)
      ? Number(filters.q.replace("#", ""))
      : null;
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      ...(asNumber !== null ? [{ number: asNumber }] : []),
    ];
  }

  return prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
      requester: { select: { name: true } },
      assignee: { select: { name: true } },
    },
  });
}

export async function getTicket(user: CurrentUser, id: string) {
  const showInternal = canWorkTickets(user.role);

  return prisma.ticket.findFirst({
    where: { id, ...ticketScope(user) },
    include: {
      requester: { select: { name: true, email: true } },
      assignee: { select: { id: true, name: true } },
      comments: {
        // Solicitantes nunca recebem comentários internos do banco.
        where: showInternal ? {} : { internal: false },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true, role: true } } },
      },
    },
  });
}

export async function listAssignees(user: CurrentUser) {
  return prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      role: { in: ["AGENT", "ADMIN"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function countByStatus(user: CurrentUser) {
  const rows = await prisma.ticket.groupBy({
    by: ["status"],
    where: ticketScope(user),
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
}
