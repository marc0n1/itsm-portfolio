import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/dal";
import { canWorkTickets } from "@/lib/permissions";

/**
 * Respostas prontas são material interno da equipe: quem não é da equipe
 * recebe lista vazia (nunca chegam ao navegador do solicitante). Sempre
 * dentro da organização do usuário.
 */
export async function listResponses(user: CurrentUser) {
  if (!canWorkTickets(user.role)) return [];
  return prisma.cannedResponse.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { title: "asc" },
    select: { id: true, title: true, body: true },
  });
}

export async function getResponse(user: CurrentUser, id: string) {
  if (!canWorkTickets(user.role)) return null;
  return prisma.cannedResponse.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, title: true, body: true },
  });
}
