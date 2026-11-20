import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { canWorkTickets } from "@/lib/permissions";
import { countByStatus } from "@/lib/ticket-queries";
import { STATUSES, STATUS_LABEL, STATUS_STYLE } from "@/lib/tickets";

export default function DashboardPage() {
  // Leitura de cookie é dado de runtime: precisa ficar dentro de <Suspense>.
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const user = await requireUser();
  const counts = await countByStatus(user);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const staff = canWorkTickets(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Olá, {user.name}</h1>
          <p className="text-sm text-zinc-500">
            {staff
              ? "Visão geral dos chamados da organização."
              : "Resumo dos chamados que você abriu."}
          </p>
        </div>
        <Link
          href="/tickets/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Novo chamado
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATUSES.map((status) => (
          <Link
            key={status}
            href={`/tickets?status=${status}`}
            className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-indigo-300"
          >
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
            >
              {STATUS_LABEL[status]}
            </span>
            <p className="mt-3 text-3xl font-semibold">{counts[status] ?? 0}</p>
          </Link>
        ))}
      </section>

      <p className="text-sm text-zinc-500">
        {total === 0
          ? "Nenhum chamado ainda."
          : `${total} chamado${total > 1 ? "s" : ""} no total.`}
      </p>
    </div>
  );
}
