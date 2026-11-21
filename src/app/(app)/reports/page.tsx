import { Suspense } from "react";
import Link from "next/link";
import Form from "next/form";
import { requireRole } from "@/lib/dal";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "@/lib/tickets";
import {
  EXPORT_LIMIT,
  NO_ASSIGNEE,
  parseReportFilters,
  reportQuery,
} from "@/lib/reports";
import { countReportTickets, listReportAssignees } from "@/lib/report-queries";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ReportsPage(props: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-zinc-500">
          Exporte chamados em CSV (abre direto no Excel). O período considera a
          data de abertura, em horário de Brasília.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
        <ReportsContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const input =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500";

async function ReportsContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("ADMIN", "AGENT");
  const parsed = parseReportFilters(await searchParams);
  const filters = "filters" in parsed ? parsed.filters : {};

  const [assignees, total] = await Promise.all([
    listReportAssignees(user),
    "filters" in parsed ? countReportTickets(user, filters) : Promise.resolve(null),
  ]);

  const query = reportQuery(filters);
  const hasFilters = query !== "";

  return (
    <>
      <Form
        action="/reports"
        className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 sm:grid-cols-2"
      >
        <label className="space-y-1 text-sm">
          <span className="font-medium">De</span>
          <input type="date" name="from" defaultValue={filters.from ?? ""} className={`${input} w-full`} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Até</span>
          <input type="date" name="to" defaultValue={filters.to ?? ""} className={`${input} w-full`} />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue={filters.status ?? ""} className={`${input} w-full`}>
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Prioridade</span>
          <select name="priority" defaultValue={filters.priority ?? ""} className={`${input} w-full`}>
            <option value="">Todas</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Responsável</span>
          <select name="assignee" defaultValue={filters.assignee ?? ""} className={`${input} w-full`}>
            <option value="">Todos</option>
            <option value={NO_ASSIGNEE}>Sem responsável</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.active ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Título ou nº</span>
          <input name="q" defaultValue={filters.q ?? ""} maxLength={100} className={`${input} w-full`} />
        </label>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm hover:bg-zinc-100"
          >
            Aplicar filtros
          </button>
          {hasFilters && (
            <Link href="/reports" className="text-sm text-indigo-600 hover:underline">
              Limpar
            </Link>
          )}
        </div>
      </Form>

      {"error" in parsed ? (
        <p role="alert" className="text-sm text-red-600">
          {parsed.error}
        </p>
      ) : (
        <section
          data-testid="report-result"
          className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-5"
        >
          <p className="text-sm">
            <span data-testid="report-count" className="text-2xl font-semibold">
              {total}
            </span>{" "}
            {total === 1 ? "chamado" : "chamados"} {hasFilters ? "com estes filtros" : "no total"}
          </p>

          {total === 0 ? (
            <span className="text-sm text-zinc-500">Nada para exportar.</span>
          ) : total! > EXPORT_LIMIT ? (
            <span role="alert" className="text-sm text-red-600">
              Acima do limite de {EXPORT_LIMIT} por exportação. Refine os filtros.
            </span>
          ) : (
            <a
              href={`/reports/export${query ? `?${query}` : ""}`}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Baixar CSV
            </a>
          )}
        </section>
      )}
    </>
  );
}
