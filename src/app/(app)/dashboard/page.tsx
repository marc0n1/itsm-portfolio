import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { canWorkTickets } from "@/lib/permissions";
import { countByStatus } from "@/lib/ticket-queries";
import { getStaffMetrics } from "@/lib/dashboard-queries";
import { formatDuration } from "@/lib/sla";
import { STATUSES, STATUS_LABEL, STATUS_STYLE } from "@/lib/tickets";
import { DailyChart } from "./daily-chart";

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
  const metrics = staff ? await getStaffMetrics(user) : null;

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

      {metrics && (
        <section aria-label="Indicadores de SLA" className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-600">Indicadores de SLA</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Tile label="Em aberto" value={String(metrics.summary.open)} />
            <Tile
              label="SLA estourado"
              value={String(metrics.summary.breached)}
              hint="chamados abertos fora do prazo"
              status={metrics.summary.breached > 0 ? "critical" : undefined}
            />
            <Tile
              label="Em risco"
              value={String(metrics.summary.atRisk)}
              hint="restam 20% ou menos do prazo"
              status={metrics.summary.atRisk > 0 ? "warning" : undefined}
            />
            <Tile
              label="Conformidade (30 dias)"
              value={
                metrics.summary.compliancePct === null
                  ? "—"
                  : `${metrics.summary.compliancePct}%`
              }
              hint={`${metrics.summary.concluded} concluídos`}
            />
            <Tile
              label="Primeira resposta (média)"
              value={
                metrics.summary.avgFirstResponseMs === null
                  ? "—"
                  : formatDuration(metrics.summary.avgFirstResponseMs)
              }
              hint="últimos 30 dias"
            />
            <Tile
              label="Resolução (média)"
              value={
                metrics.summary.avgResolutionMs === null
                  ? "—"
                  : formatDuration(metrics.summary.avgResolutionMs)
              }
              hint="sem o tempo em Aguardando"
            />
          </div>
        </section>
      )}

      <section aria-label="Chamados por status" className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-600">Chamados por status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        </div>
        <p className="text-sm text-zinc-500">
          {total === 0
            ? "Nenhum chamado ainda."
            : `${total} chamado${total > 1 ? "s" : ""} no total.`}
        </p>
      </section>

      {metrics && (
        <section
          aria-label="Chamados abertos por dia"
          className="space-y-3 rounded-lg border border-zinc-200 bg-[var(--viz-surface)] p-4"
        >
          <div>
            <h2 className="text-base font-medium">Chamados abertos por dia</h2>
            <p className="text-xs text-zinc-500">Últimos 14 dias</p>
          </div>
          <DailyChart
            data={metrics.daily}
            title="Chamados abertos por dia, últimos 14 dias"
          />
        </section>
      )}
    </div>
  );
}

/** Cartão de indicador. Cor de status sempre acompanha ícone e rótulo. */
function Tile({
  label,
  value,
  hint,
  status,
}: {
  label: string;
  value: string;
  hint?: string;
  status?: "critical" | "warning";
}) {
  return (
    <div
      data-testid="kpi"
      data-status={status}
      className="rounded-lg border border-zinc-200 bg-white p-4"
    >
      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
        {status && (
          <span
            aria-hidden
            style={{ color: status === "critical" ? "#d03b3b" : "#fab219" }}
          >
            {status === "critical" ? "●" : "▲"}
          </span>
        )}
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
