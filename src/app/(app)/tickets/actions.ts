"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/dal";
import { canWorkTickets } from "@/lib/permissions";
import { z } from "zod";
import { TicketStatus } from "@/generated/prisma/enums";
import { statusTransition } from "@/lib/ticket-status";
import { diffTicket } from "@/lib/ticket-events";
import { planAssignment, planComment, planStatusChange } from "@/lib/notifications";
import { filesFrom, removeFiles, storeFiles } from "@/lib/attachment-storage";
import { ticketScope } from "@/lib/ticket-queries";
import { buildAnswers, parseFields, type Answer } from "@/lib/services";
import {
  commentSchema,
  createTicketSchema,
  STATUS_LABEL,
  formValues,
  updateTicketSchema,
  type FormState,
} from "@/lib/tickets";

export async function createTicket(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(formData);

  const parsed = createTicketSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  if (user.role === "REQUESTER" && parsed.data.priority === "CRITICAL") {
    return {
      error: "A prioridade crítica só pode ser definida pelo atendimento.",
      values,
    };
  }

  // Chamado a partir de um serviço do catálogo: o formulário dinâmico daquele
  // serviço é validado aqui, no servidor, contra a definição salva no banco.
  const rawServiceId = formData.get("serviceId");
  let serviceId: string | undefined;
  let answers: Answer[] | undefined;

  if (typeof rawServiceId === "string" && rawServiceId) {
    const service = await prisma.service.findFirst({
      where: {
        id: rawServiceId,
        organizationId: user.organizationId,
        active: true,
      },
      select: { id: true, fields: true },
    });
    if (!service) {
      return { error: "Este serviço não está mais disponível.", values };
    }

    const built = buildAnswers(parseFields(service.fields), formData);
    if (built.error) return { error: built.error, values };

    serviceId = service.id;
    answers = built.answers;
  }

  const upload = await storeFiles(filesFrom(formData));
  if ("error" in upload) return { error: upload.error, values };

  let ticket: { id: string };
  try {
    ticket = await prisma.ticket.create({
      data: {
        ...parsed.data,
        organizationId: user.organizationId,
        requesterId: user.id,
        events: { create: { type: "CREATED", actorId: user.id } },
        attachments: {
          create: upload.stored.map((f) => ({ ...f, uploaderId: user.id })),
        },
        ...(serviceId ? { serviceId, formData: answers } : {}),
      },
      select: { id: true },
    });
  } catch (err) {
    await removeFiles(upload.stored);
    throw err;
  }

  redirect(`/tickets/${ticket.id}`);
}

/** Somente agentes e admins alteram status, prioridade e responsável. */
export async function updateTicket(formData: FormData) {
  const user = await requireRole("ADMIN", "AGENT");

  const parsed = updateTicketSchema.safeParse({
    ticketId: formData.get("ticketId"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    assigneeId: formData.get("assigneeId") ?? undefined,
  });
  if (!parsed.success) return;

  const { ticketId, status, priority } = parsed.data;
  const assigneeId = parsed.data.assigneeId || null;

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...ticketScope(user) },
    select: {
      id: true,
      number: true,
      title: true,
      requesterId: true,
      status: true,
      priority: true,
      resolvedAt: true,
      slaPausedAt: true,
      slaPausedSeconds: true,
      assignee: { select: { id: true, name: true } },
    },
  });
  if (!ticket) notFound();

  let assigneeName: string | null = null;
  if (assigneeId) {
    // O responsável precisa ser da equipe de atendimento da MESMA organização.
    const assignee = await prisma.user.findFirst({
      where: {
        id: assigneeId,
        organizationId: user.organizationId,
        role: { in: ["AGENT", "ADMIN"] },
      },
      select: { id: true, name: true },
    });
    if (!assignee) return;
    assigneeName = assignee.name;
  }

  const changes = diffTicket(
    {
      status: ticket.status,
      priority: ticket.priority,
      assignee: ticket.assignee?.name ?? null,
    },
    { status, priority, assignee: assigneeName },
  );

  const notifications = [
    ...(changes.some((c) => c.type === "STATUS")
      ? planStatusChange({
          actorId: user.id,
          requesterId: ticket.requesterId,
          number: ticket.number,
          toLabel: STATUS_LABEL[status],
        })
      : []),
    ...(changes.some((c) => c.type === "ASSIGNEE")
      ? planAssignment({
          actorId: user.id,
          newAssigneeId: assigneeId,
          number: ticket.number,
          title: ticket.title,
        })
      : []),
  ];

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      priority,
      assigneeId,
      ...statusTransition(ticket, status),
      events: {
        create: changes.map((c) => ({ ...c, actorId: user.id })),
      },
      notifications: { create: notifications },
    },
  });

  revalidateTicketViews(ticket.id);
}

function revalidateTicketViews(ticketId: string) {
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/tickets/board");
  revalidatePath("/dashboard");
}

/** Move um chamado de coluna no Kanban (altera só o status). */
export async function moveTicket(
  ticketId: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("ADMIN", "AGENT");

  const parsedStatus = z.enum(TicketStatus).safeParse(status);
  if (!parsedStatus.success || typeof ticketId !== "string") {
    return { ok: false, error: "Status inválido." };
  }

  // Mesmo escopo das consultas: chamado de outra organização não é encontrado.
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, ...ticketScope(user) },
    select: {
      id: true,
      number: true,
      requesterId: true,
      status: true,
      resolvedAt: true,
      slaPausedAt: true,
      slaPausedSeconds: true,
    },
  });
  if (!ticket) return { ok: false, error: "Chamado não encontrado." };
  if (ticket.status === parsedStatus.data) return { ok: true };

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      ...statusTransition(ticket, parsedStatus.data),
      events: {
        create: {
          type: "STATUS",
          from: ticket.status,
          to: parsedStatus.data,
          actorId: user.id,
        },
      },
      notifications: {
        create: planStatusChange({
          actorId: user.id,
          requesterId: ticket.requesterId,
          number: ticket.number,
          toLabel: STATUS_LABEL[parsedStatus.data],
        }),
      },
    },
  });

  revalidateTicketViews(ticket.id);
  return { ok: true };
}

export async function addComment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = commentSchema.safeParse({
    ticketId: formData.get("ticketId"),
    body: formData.get("body"),
    internal: formData.get("internal") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Mesmo escopo da leitura: solicitante só comenta nos próprios chamados.
  const ticket = await prisma.ticket.findFirst({
    where: { id: parsed.data.ticketId, ...ticketScope(user) },
    select: {
      id: true,
      number: true,
      requesterId: true,
      assigneeId: true,
      firstResponseAt: true,
    },
  });
  if (!ticket) notFound();

  const staff = canWorkTickets(user.role);
  // Nota interna só existe para a equipe; solicitante nunca a cria.
  const internal = staff && parsed.data.internal === "on";

  const upload = await storeFiles(filesFrom(formData));
  if ("error" in upload) {
    return { error: upload.error, values: { body: parsed.data.body } };
  }

  const notifications = planComment({
    actorId: user.id,
    authorName: user.name,
    requesterId: ticket.requesterId,
    assigneeId: ticket.assigneeId,
    internal,
    number: ticket.number,
  });

  try {
    // Comentário e avisos juntos: ou grava tudo, ou nada.
    await prisma.$transaction([
      prisma.comment.create({
        data: {
          ticketId: ticket.id,
          authorId: user.id,
          body: parsed.data.body,
          internal,
          attachments: {
            create: upload.stored.map((f) => ({
              ...f,
              ticketId: ticket.id,
              uploaderId: user.id,
            })),
          },
        },
      }),
      prisma.notification.createMany({
        data: notifications.map((n) => ({ ...n, ticketId: ticket.id })),
      }),
    ]);
  } catch (err) {
    await removeFiles(upload.stored);
    throw err;
  }

  // SLA: a primeira resposta PÚBLICA da equipe encerra o relógio de resposta.
  if (staff && !internal && !ticket.firstResponseAt) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { firstResponseAt: new Date() },
    });
  }

  revalidatePath(`/tickets/${ticket.id}`);
  return { saved: true };
}

/**
 * Remove um anexo. Quem pode: quem enviou o arquivo OU a equipe de atendimento,
 * sempre dentro do escopo do chamado. A remoção fica na trilha de auditoria.
 */
export async function removeAttachment(formData: FormData) {
  const user = await requireUser();

  const parsed = z
    .object({ ticketId: z.string().min(1), attachmentId: z.string().min(1) })
    .safeParse({
      ticketId: formData.get("ticketId"),
      attachmentId: formData.get("attachmentId"),
    });
  if (!parsed.success) return;

  const staff = canWorkTickets(user.role);
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: parsed.data.attachmentId,
      ticketId: parsed.data.ticketId,
      ticket: ticketScope(user),
      // Mesma visibilidade da leitura: anexo de nota interna é só da equipe.
      ...(staff ? {} : { OR: [{ commentId: null }, { comment: { internal: false } }] }),
    },
    select: { id: true, ticketId: true, uploaderId: true, filename: true, storageKey: true },
  });
  if (!attachment) return;
  if (!staff && attachment.uploaderId !== user.id) return;

  // Banco primeiro: se a remoção do arquivo falhar, sobra um arquivo órfão
  // (inofensivo), nunca um anexo na tela que não baixa.
  await prisma.$transaction([
    prisma.attachment.delete({ where: { id: attachment.id } }),
    prisma.ticketEvent.create({
      data: {
        ticketId: attachment.ticketId,
        actorId: user.id,
        type: "ATTACHMENT_REMOVED",
        from: attachment.filename,
      },
    }),
  ]);
  await removeFiles([attachment]);

  revalidatePath(`/tickets/${attachment.ticketId}`);
}
