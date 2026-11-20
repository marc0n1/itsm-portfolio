"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { PRIORITIES, PRIORITY_LABEL, formValues, type FormState } from "@/lib/tickets";

const MAX_HOURS = 24 * 90; // 90 dias

function parseHours(raw: FormDataEntryValue | null): number {
  // Aceita vírgula decimal ("1,5") além do ponto.
  return Number(String(raw ?? "").trim().replace(",", "."));
}

export async function saveSla(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("ADMIN");
  const values = formValues(formData);

  const rows: {
    priority: (typeof PRIORITIES)[number];
    responseMinutes: number;
    resolutionMinutes: number;
  }[] = [];

  for (const priority of PRIORITIES) {
    const label = PRIORITY_LABEL[priority];
    const response = parseHours(formData.get(`response_${priority}`));
    const resolution = parseHours(formData.get(`resolution_${priority}`));

    if (!Number.isFinite(response) || !Number.isFinite(resolution)) {
      return { error: `Informe números válidos para a prioridade ${label}.`, values };
    }
    if (response <= 0 || resolution <= 0) {
      return { error: `Os prazos da prioridade ${label} precisam ser maiores que zero.`, values };
    }
    if (response > MAX_HOURS || resolution > MAX_HOURS) {
      return { error: `Os prazos da prioridade ${label} podem ter no máximo ${MAX_HOURS} horas.`, values };
    }
    if (response > resolution) {
      return {
        error: `Na prioridade ${label}, a primeira resposta não pode demorar mais que a resolução.`,
        values,
      };
    }

    rows.push({
      priority,
      responseMinutes: Math.max(1, Math.round(response * 60)),
      resolutionMinutes: Math.max(1, Math.round(resolution * 60)),
    });
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.slaPolicy.upsert({
        where: {
          organizationId_priority: {
            organizationId: user.organizationId,
            priority: r.priority,
          },
        },
        update: {
          responseMinutes: r.responseMinutes,
          resolutionMinutes: r.resolutionMinutes,
        },
        create: { ...r, organizationId: user.organizationId },
      }),
    ),
  );

  // Os prazos são calculados na leitura, então todas as telas se atualizam.
  for (const path of ["/admin/sla", "/tickets", "/tickets/board", "/dashboard"]) {
    revalidatePath(path);
  }

  return { saved: true };
}
