"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";

/** Marca como lida (só se for do próprio usuário) e abre o chamado. */
export async function openNotification(formData: FormData) {
  const user = await requireUser();
  const id = z.string().min(1).safeParse(formData.get("notificationId"));
  if (!id.success) return;

  const notification = await prisma.notification.findFirst({
    where: { id: id.data, userId: user.id },
    select: { id: true, ticketId: true, readAt: true },
  });
  if (!notification) return;

  if (!notification.readAt) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
    });
  }
  revalidatePath("/", "layout");
  redirect(`/tickets/${notification.ticketId}`);
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
