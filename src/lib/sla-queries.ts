import "server-only";
import { prisma } from "@/lib/prisma";
import { policiesFromRows, type SlaPolicies } from "@/lib/sla";

/** Políticas da organização; prioridades sem registro usam o padrão. */
export async function getSlaPolicies(organizationId: string): Promise<SlaPolicies> {
  const rows = await prisma.slaPolicy.findMany({ where: { organizationId } });
  return policiesFromRows(rows);
}
