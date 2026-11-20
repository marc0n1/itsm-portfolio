import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { canWorkTickets } from "@/lib/permissions";
import { ticketScope } from "@/lib/ticket-queries";
import { readStored } from "@/lib/attachment-storage";

/**
 * Download autenticado. O arquivo nunca é público: a mesma regra de
 * visibilidade do chamado vale aqui (organização, dono do chamado e
 * anexos de nota interna só para a equipe).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const staff = canWorkTickets(user.role);
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      ticketId: id,
      ticket: ticketScope(user),
      ...(staff ? {} : { OR: [{ commentId: null }, { comment: { internal: false } }] }),
    },
  });
  if (!attachment) return new Response("Não encontrado.", { status: 404 });

  let body: Buffer;
  try {
    body = await readStored(attachment.storageKey);
  } catch {
    return new Response("Arquivo indisponível.", { status: 404 });
  }

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(body.length),
      // Sempre baixar (nunca renderizar na nossa origem) + sem sniffing.
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
