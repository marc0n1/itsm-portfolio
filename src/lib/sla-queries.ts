import "server-only";
import { prisma } from "@/lib/prisma";
import { PRIORITIES } from "@/lib/tickets";
import { DEFAULT_SLA, type SlaPolicies } from "@/lib/sla";

/** Políticas da organização; prioridades sem registro usam o padrão. */
export async function getSlaPolicies(organizationId: string): Promise<SlaPolicies> {
  const rows = await prisma.slaPolicy.findMany({ where: { organizationId } });
  const policies = { ...DEFAULT_SLA } as SlaPolicies;
  for (const p of PRIORITIES) {
    const row = rows.find((r) => r.priority === p);
    if (row) {
      policies[p] = {
        responseMinutes: row.responseMinutes,
        resolutionMinutes: row.resolutionMinutes,
      };
    }
  }
  return policies;
}
