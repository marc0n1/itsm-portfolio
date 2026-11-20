import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/dal";

/** Só as notificações do próprio usuário: nunca existe consulta "de outro". */
export async function getNotifications(user: CurrentUser, take = 10) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        ticketId: true,
        message: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { items, unread };
}
