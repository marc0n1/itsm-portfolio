import {
  CLOCK_KIND_LABEL,
  clockLabel,
  type ClockKind,
  type ClockState,
  type SlaClock,
} from "@/lib/sla";

export const CLOCK_STYLE: Record<ClockState, string> = {
  ok: "bg-green-100 text-green-800",
  at_risk: "bg-amber-100 text-amber-800",
  breached: "bg-red-100 text-red-800",
  paused: "bg-zinc-200 text-zinc-700",
  met: "bg-green-50 text-green-700",
  missed: "bg-red-50 text-red-700",
};

/**
 * Indicador de SLA. Com `kind`, mostra em duas linhas (qual relógio / estado),
 * o que evita pílulas com texto longo quebrado em tabelas estreitas.
 */
export function SlaBadge({
  clock,
  kind,
}: {
  clock: SlaClock;
  kind?: ClockKind;
}) {
  return (
    <span
      data-sla-state={clock.state}
      className={`inline-flex flex-col rounded-md px-2 py-1 text-xs leading-snug ${CLOCK_STYLE[clock.state]}`}
    >
      {kind && <span className="opacity-70">{CLOCK_KIND_LABEL[kind]}</span>}
      <span className="font-medium">{clockLabel(clock)}</span>
    </span>
  );
}
