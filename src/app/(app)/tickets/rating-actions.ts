"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { ticketScope } from "@/lib/ticket-queries";
import { canRate, ratingSchema } from "@/lib/csat";
import { planRating } from "@/lib/notifications";
import type { FormState } from "@/lib/tickets";

/**
 * Avalia (ou reavalia) um chamado concluído. A regra de quem pode vem de
 * `canRate`, aplicada AQUI no servidor: esconder o formulário não basta.
 */
export async function rateTicket(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const values = {
    score: String(formData.get("score") ?? ""),
    comment: String(formData.get("comment") ?? ""),
  };
  const parsed = ratingSchema.safeParse({
    ticketId: formData.get("ticketId"),
    score: formData.get("score") ?? undefined,
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  // Mesmo escopo da leitura: chamado de outra pessoa/organização não é achado.
  const ticket = await prisma.ticket.findFirst({
    where: { id: parsed.data.ticketId, ...ticketScope(user) },
    select: {
      id: true,
      number: true,
      status: true,
      requesterId: true,
      assigneeId: true,
      csatScore: true,
    },
  });
  if (!ticket) return { error: "Chamado não encontrado.", values };

  if (!canRate(ticket, user.id)) {
    return {
      error: "Só o solicitante pode avaliar, e apenas depois que o chamado for concluído.",
      values,
    };
  }

  const { score, comment } = parsed.data;
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      csatScore: score,
      csatComment: comment,
      csatAt: new Date(),
      notifications: {
        create: planRating({
          actorId: user.id,
          authorName: user.name,
          assigneeId: ticket.assigneeId,
          number: ticket.number,
          score,
          isUpdate: ticket.csatScore !== null,
        }),
      },
    },
  });

  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/dashboard");
  return { saved: true };
}
