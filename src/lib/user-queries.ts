import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/dal";

/** Sempre dentro da organização do admin: nunca enxerga usuários de outra. */
export async function listUsers(user: CurrentUser) {
  return prisma.user.findMany({
    where: { organizationId: user.organizationId },
    // Ativos primeiro; depois por nome.
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { requested: true, assigned: true } },
    },
  });
}

export async function getUserById(user: CurrentUser, id: string) {
  return prisma.user.findFirst({
    where: { id, organizationId: user.organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { requested: true, assigned: true } },
    },
  });
}

export function countActiveAdmins(organizationId: string) {
  return prisma.user.count({
    where: { organizationId, role: "ADMIN", active: true },
  });
}
