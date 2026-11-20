import Link from "next/link";
import { requireUser } from "@/lib/dal";
import {
  ROLE_LABEL,
  canManageServices,
  canManageUsers,
  canWorkTickets,
} from "@/lib/permissions";
import { logout } from "../login/actions";
import { NotificationBell } from "./notifications/notification-bell";

export async function AppHeader() {
  const user = await requireUser();

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/dashboard" className="font-semibold">
            Central de Chamados
          </Link>
          <Link href="/dashboard" className="text-zinc-600 hover:text-zinc-900">
            Painel
          </Link>
          <Link href="/tickets" className="text-zinc-600 hover:text-zinc-900">
            Chamados
          </Link>
          {canWorkTickets(user.role) && (
            <Link
              href="/tickets/board"
              className="text-zinc-600 hover:text-zinc-900"
            >
              Quadro
            </Link>
          )}
          {canManageServices(user.role) && (
            <Link
              href="/admin/services"
              className="text-zinc-600 hover:text-zinc-900"
            >
              Serviços
            </Link>
          )}
          {canManageUsers(user.role) && (
            <Link href="/admin/users" className="text-zinc-600 hover:text-zinc-900">
              Usuários
            </Link>
          )}
          {canManageServices(user.role) && (
            <Link href="/admin/sla" className="text-zinc-600 hover:text-zinc-900">
              SLA
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-4 text-sm">
          <NotificationBell />
          <Link
            href="/account"
            aria-label="Minha conta"
            className="rounded-md px-2 py-1 text-right leading-tight hover:bg-zinc-100"
          >
            <span className="block font-medium">{user.name}</span>
            <span className="block text-xs text-zinc-500">
              {ROLE_LABEL[user.role]}
            </span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
