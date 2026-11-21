/**
 * Regras puras dos alertas de SLA (sem banco, sem relógio global): dado um
 * chamado e o "agora", dizem QUAIS relógios merecem alerta, QUEM avisar e o
 * TEXTO. O que já foi avisado (para não repetir) é controlado fora, na tabela
 * SlaAlert, pela chave (chamado, relógio, estado, prazo).
 */
import { computeSla, formatDuration, type SlaPolicy, type SlaTicket } from "@/lib/sla";

export type AlertClock = "RESPONSE" | "RESOLUTION";
export type AlertState = "AT_RISK" | "BREACHED";

export type SlaAlertCandidate = {
  clock: AlertClock;
  state: AlertState;
  /** Prazo do relógio: faz parte da chave (se o prazo muda, o alerta pode repetir). */
  dueAt: Date;
  /** Positivo = sobra; negativo = atraso. */
  remainingMs: number;
};

/**
 * Relógios do chamado que estão "em risco" ou "estourados" agora.
 *
 * Só relógios CORRENDO contam: resposta já dada, chamado resolvido ou
 * resolução pausada em "Aguardando" não geram alerta (o computeSla já os
 * classifica como met/missed/paused).
 */
export function planSlaAlerts(
  ticket: SlaTicket,
  policy: SlaPolicy,
  now: Date,
): SlaAlertCandidate[] {
  const sla = computeSla(ticket, policy, now);
  const out: SlaAlertCandidate[] = [];

  const consider = (clock: AlertClock, c: { state: string; dueAt: Date; remainingMs: number }) => {
    if (c.state === "at_risk") {
      out.push({ clock, state: "AT_RISK", dueAt: c.dueAt, remainingMs: c.remainingMs });
    } else if (c.state === "breached") {
      out.push({ clock, state: "BREACHED", dueAt: c.dueAt, remainingMs: c.remainingMs });
    }
  };
  consider("RESPONSE", sla.response);
  consider("RESOLUTION", sla.resolution);
  return out;
}

export type Staff = { id: string; role: "ADMIN" | "AGENT" };

/**
 * Quem avisar (só equipe ATIVA entra em `staff`):
 * - em risco: o responsável; sem responsável, TODA a equipe (ninguém é dono);
 * - estourado: o responsável + os administradores (escalonamento); sem
 *   responsável, toda a equipe.
 * Um responsável que foi desativado conta como "sem responsável".
 */
export function slaRecipients(input: {
  state: AlertState;
  assigneeId: string | null;
  staff: Staff[];
}): string[] {
  const owner = input.staff.find((s) => s.id === input.assigneeId);
  if (!owner) return input.staff.map((s) => s.id);

  const ids = [owner.id];
  if (input.state === "BREACHED") {
    for (const s of input.staff) if (s.role === "ADMIN") ids.push(s.id);
  }
  return [...new Set(ids)];
}

const CLOCK_NAME: Record<AlertClock, string> = {
  RESPONSE: "da primeira resposta",
  RESOLUTION: "da resolução",
};

export function slaAlertMessage(input: {
  number: number;
  clock: AlertClock;
  state: AlertState;
  remainingMs: number;
}): string {
  const base = `Chamado #${input.number}: prazo ${CLOCK_NAME[input.clock]}`;
  return input.state === "AT_RISK"
    ? `${base} em risco (restam ${formatDuration(input.remainingMs)})`
    : `${base} estourado (há ${formatDuration(input.remainingMs)})`;
}
