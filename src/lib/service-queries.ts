import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/dal";
import { parseFields } from "@/lib/services";

/** Catálogo da organização. Quem não é admin só enxerga serviços ativos. */
export async function listServices(
  user: CurrentUser,
  opts: { activeOnly?: boolean } = {},
) {
  const rows = await prisma.service.findMany({
    where: {
      organizationId: user.organizationId,
      ...(opts.activeOnly ? { active: true } : {}),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { tickets: true } } },
  });
  return rows.map((s) => ({ ...s, fields: parseFields(s.fields) }));
}

export async function getService(
  user: CurrentUser,
  id: string,
  opts: { activeOnly?: boolean } = {},
) {
  const s = await prisma.service.findFirst({
    where: {
      id,
      organizationId: user.organizationId,
      ...(opts.activeOnly ? { active: true } : {}),
    },
  });
  return s ? { ...s, fields: parseFields(s.fields) } : null;
}
