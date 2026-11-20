import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/permissions";
import { listUsers } from "@/lib/user-queries";
import { formatDate } from "@/lib/tickets";

export default function UsersAdminPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
      <UsersContent />
    </Suspense>
  );
}

async function UsersContent() {
  const me = await requireRole("ADMIN");
  const users = await listUsers(me);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuários</h1>
          <p className="text-sm text-zinc-500">
            Quem pode entrar no sistema e com qual perfil.
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Novo usuário
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2.5">Usuário</th>
              <th className="px-4 py-2.5">Perfil</th>
              <th className="px-4 py-2.5">Situação</th>
              <th className="px-4 py-2.5">Criado em</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.map((u) => (
              <tr
                key={u.id}
                data-testid="user-row"
                className={u.active ? "hover:bg-zinc-50" : "bg-zinc-50 text-zinc-500"}
              >
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {u.name}
                    {u.id === me.id && (
                      <span className="ml-2 text-xs font-normal text-zinc-500">(você)</span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">{u.email}</p>
                </td>
                <td className="px-4 py-3">{ROLE_LABEL[u.role]}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      u.active
                        ? "bg-green-100 text-green-800"
                        : "bg-zinc-200 text-zinc-700"
                    }`}
                  >
                    {u.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/users/${u.id}`}
                    aria-label={`Editar ${u.name}`}
                    className="text-indigo-600 hover:underline"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
