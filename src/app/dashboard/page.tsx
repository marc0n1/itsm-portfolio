import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { ROLE_LABEL, canManageUsers, canWorkTickets } from "@/lib/permissions";
import { logout } from "../login/actions";

export default function DashboardPage() {
  // Leitura de cookie é dado de runtime: precisa ficar dentro de <Suspense>.
  return (
    <Suspense
      fallback={<p className="p-8 text-sm text-zinc-500">Carregando...</p>}
    >
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Olá, {user.name}</h1>
          <p className="text-sm text-zinc-500">
            {user.email} · {ROLE_LABEL[user.role]}
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
          >
            Sair
          </button>
        </form>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 text-sm">
        <p className="mb-2 font-medium">Permissões deste perfil</p>
        <ul className="list-inside list-disc space-y-1 text-zinc-600">
          <li>Abrir e acompanhar chamados: sim</li>
          <li>Atender chamados: {canWorkTickets(user.role) ? "sim" : "não"}</li>
          <li>
            Gerenciar usuários: {canManageUsers(user.role) ? "sim" : "não"}
          </li>
        </ul>
      </section>
    </main>
  );
}
