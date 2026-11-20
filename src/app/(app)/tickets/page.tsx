import { Suspense } from "react";
import Link from "next/link";
import Form from "next/form";
import { requireUser } from "@/lib/dal";
import { canWorkTickets } from "@/lib/permissions";
import { listTickets } from "@/lib/ticket-queries";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  formatDate,
  ticketFiltersSchema,
} from "@/lib/tickets";
import { PriorityBadge, StatusBadge } from "../badges";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function TicketsPage(props: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
      <TicketsContent searchParams={props.searchParams} />
    </Suspense>
  );
}

const input =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500";

async function TicketsContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const raw = await searchParams;

  // Aceita só o primeiro valor de cada parâmetro; inválidos viram "sem filtro".
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const filters = ticketFiltersSchema.parse({
    status: first(raw.status),
    priority: first(raw.priority),
    q: first(raw.q),
    mine: first(raw.mine),
  });

  const tickets = await listTickets(user, filters);
  const staff = canWorkTickets(user.role);
  const hasFilters = Boolean(
    filters.status || filters.priority || filters.q || filters.mine,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {staff ? "Chamados" : "Meus chamados"}
        </h1>
        <Link
          href="/tickets/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Novo chamado
        </Link>
      </div>

      <Form action="/tickets" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Buscar por título ou nº"
          className={`${input} w-56`}
        />
        <select name="status" defaultValue={filters.status ?? ""} className={input}>
          <option value="">Todos os status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          name="priority"
          defaultValue={filters.priority ?? ""}
          className={input}
        >
          <option value="">Todas as prioridades</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        {staff && (
          <label className="flex items-center gap-1.5 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="mine"
              value="1"
              defaultChecked={filters.mine === "1"}
            />
            Atribuídos a mim
          </label>
        )}
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100"
        >
          Filtrar
        </button>
        {hasFilters && (
          <Link href="/tickets" className="text-sm text-indigo-600 hover:underline">
            Limpar
          </Link>
        )}
      </Form>

      {tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          {hasFilters
            ? "Nenhum chamado encontrado com esses filtros."
            : "Nenhum chamado ainda. Abra o primeiro!"}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Nº</th>
                <th className="px-4 py-2.5">Título</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Prioridade</th>
                {staff && <th className="px-4 py-2.5">Solicitante</th>}
                <th className="px-4 py-2.5">Responsável</th>
                <th className="px-4 py-2.5">Aberto em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 text-zinc-500">#{t.number}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  {staff && <td className="px-4 py-3">{t.requester.name}</td>}
                  <td className="px-4 py-3 text-zinc-600">
                    {t.assignee?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatDate(t.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tickets.length === 100 && (
        <p className="text-xs text-zinc-500">
          Mostrando os 100 mais recentes. Use os filtros para refinar.
        </p>
      )}
    </div>
  );
}
