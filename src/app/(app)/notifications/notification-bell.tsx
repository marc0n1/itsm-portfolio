import { requireUser } from "@/lib/dal";
import { getNotifications } from "@/lib/notification-queries";
import { formatDate } from "@/lib/tickets";
import { BellMenu } from "./bell-menu";
import { markAllNotificationsRead, openNotification } from "./actions";

export async function NotificationBell() {
  const user = await requireUser();
  const { items, unread } = await getNotifications(user);

  return (
    <BellMenu unread={unread}>
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <h2 className="text-sm font-medium">Notificações</h2>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="text-xs text-indigo-600 hover:underline"
            >
              Marcar todas como lidas
            </button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-zinc-500">
          Nenhuma notificação.
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="notificationId" value={n.id} />
                <button
                  type="submit"
                  data-unread={n.readAt ? "false" : "true"}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                    n.readAt ? "text-zinc-600" : "bg-indigo-50/60 font-medium"
                  }`}
                >
                  <span className="block">{n.message}</span>
                  <span className="block text-xs font-normal text-zinc-500">
                    {formatDate(n.createdAt)}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </BellMenu>
  );
}
