// Cálculo de SLA: funções PURAS (sem banco, sem relógio global), para serem
// fáceis de testar. O "agora" é sempre passado como argumento.
//
// Regras:
// - Resposta:  prazo = criação + meta de resposta. Termina na primeira
//   resposta pública da equipe (ou na resolução, se o chamado foi resolvido
//   sem resposta). NÃO é afetado pela pausa em "Aguardando".
// - Resolução: prazo = criação + meta de resolução + tempo pausado. Enquanto o
//   chamado está em "Aguardando" o relógio fica parado.
// - Atendimento 24x7 (sem horário comercial).
//
// Os prazos não são gravados no banco: mudar a política ou a prioridade de um
// chamado recalcula tudo na leitura.

import type { Priority, TicketStatus } from "@/generated/prisma/enums";

export type SlaPolicy = { responseMinutes: number; resolutionMinutes: number };
export type SlaPolicies = Record<Priority, SlaPolicy>;

export const DEFAULT_SLA: SlaPolicies = {
  CRITICAL: { responseMinutes: 15, resolutionMinutes: 4 * 60 },
  HIGH: { responseMinutes: 60, resolutionMinutes: 8 * 60 },
  MEDIUM: { responseMinutes: 4 * 60, resolutionMinutes: 24 * 60 },
  LOW: { responseMinutes: 8 * 60, resolutionMinutes: 72 * 60 },
};

export type SlaTicket = {
  createdAt: Date;
  priority: Priority;
  status: TicketStatus;
  resolvedAt: Date | null;
  firstResponseAt: Date | null;
  slaPausedAt: Date | null;
  slaPausedSeconds: number;
};

/**
 * ok        dentro do prazo
 * at_risk   dentro do prazo, mas restam 20% ou menos da meta
 * breached  prazo vencido e ainda em aberto
 * paused    relógio parado (somente resolução, em "Aguardando")
 * met       concluído dentro do prazo
 * missed    concluído fora do prazo
 */
export type ClockState = "ok" | "at_risk" | "breached" | "paused" | "met" | "missed";

export type SlaClock = {
  state: ClockState;
  /** Prazo final (para "paused", o prazo caso o relógio voltasse agora). */
  dueAt: Date;
  /** Positivo = sobra; negativo = atraso. Para "paused", o valor congelado. */
  remainingMs: number;
  targetMinutes: number;
};

export type SlaResult = { response: SlaClock; resolution: SlaClock };

const MIN = 60_000;
const AT_RISK_FRACTION = 0.2;

function runningState(remainingMs: number, targetMinutes: number): ClockState {
  if (remainingMs < 0) return "breached";
  return remainingMs <= targetMinutes * MIN * AT_RISK_FRACTION ? "at_risk" : "ok";
}

export function computeSla(
  t: SlaTicket,
  policy: SlaPolicy,
  now: Date,
): SlaResult {
  const created = t.createdAt.getTime();

  // --- Primeira resposta (relógio nunca pausa) ---
  const responseDue = created + policy.responseMinutes * MIN;
  const respondedAt = t.firstResponseAt ?? t.resolvedAt;
  let response: SlaClock;
  if (respondedAt) {
    response = {
      state: respondedAt.getTime() <= responseDue ? "met" : "missed",
      dueAt: new Date(responseDue),
      remainingMs: responseDue - respondedAt.getTime(),
      targetMinutes: policy.responseMinutes,
    };
  } else {
    const remaining = responseDue - now.getTime();
    response = {
      state: runningState(remaining, policy.responseMinutes),
      dueAt: new Date(responseDue),
      remainingMs: remaining,
      targetMinutes: policy.responseMinutes,
    };
  }

  // --- Resolução (pausa em "Aguardando") ---
  const baseDue =
    created + policy.resolutionMinutes * MIN + t.slaPausedSeconds * 1000;
  let resolution: SlaClock;
  if (t.resolvedAt) {
    resolution = {
      state: t.resolvedAt.getTime() <= baseDue ? "met" : "missed",
      dueAt: new Date(baseDue),
      remainingMs: baseDue - t.resolvedAt.getTime(),
      targetMinutes: policy.resolutionMinutes,
    };
  } else if (t.slaPausedAt) {
    const pausedAt = t.slaPausedAt.getTime();
    resolution = {
      state: "paused",
      // Se o relógio voltasse agora, o prazo seria empurrado pelo tempo parado.
      dueAt: new Date(baseDue + (now.getTime() - pausedAt)),
      remainingMs: baseDue - pausedAt, // valor congelado no início da pausa
      targetMinutes: policy.resolutionMinutes,
    };
  } else {
    const remaining = baseDue - now.getTime();
    resolution = {
      state: runningState(remaining, policy.resolutionMinutes),
      dueAt: new Date(baseDue),
      remainingMs: remaining,
      targetMinutes: policy.resolutionMinutes,
    };
  }

  return { response, resolution };
}

/** Pior estado entre os dois relógios, para um único indicador (lista/quadro). */
const SEVERITY: Record<ClockState, number> = {
  breached: 5,
  missed: 4,
  at_risk: 3,
  paused: 2,
  ok: 1,
  met: 0,
};

export type ClockKind = "response" | "resolution";

export function worstClockOf(r: SlaResult): { kind: ClockKind; clock: SlaClock } {
  // Só conta o relógio de resposta enquanto ele ainda está correndo: depois
  // de respondido, o que interessa ao dia a dia é o prazo de resolução.
  const responseActive = ["ok", "at_risk", "breached"].includes(r.response.state);
  if (
    responseActive &&
    SEVERITY[r.response.state] > SEVERITY[r.resolution.state]
  ) {
    return { kind: "response", clock: r.response };
  }
  return { kind: "resolution", clock: r.resolution };
}

export function worstClock(r: SlaResult): SlaClock {
  return worstClockOf(r).clock;
}

export const CLOCK_KIND_LABEL: Record<ClockKind, string> = {
  response: "Resposta",
  resolution: "Resolução",
};

export function formatDuration(ms: number) {
  const totalMin = Math.floor(Math.abs(ms) / MIN);
  if (totalMin < 1) return "menos de 1min";
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  return `${m}min`;
}

export function clockLabel(c: SlaClock) {
  switch (c.state) {
    case "ok":
    case "at_risk":
      return `Resta ${formatDuration(c.remainingMs)}`;
    case "breached":
      return `Estourado há ${formatDuration(c.remainingMs)}`;
    case "paused":
      // Se já estava atrasado quando foi pausado, o valor congelado é negativo.
      return c.remainingMs >= 0
        ? `Pausado (resta ${formatDuration(c.remainingMs)})`
        : `Pausado (atrasado ${formatDuration(c.remainingMs)})`;
    case "met":
      return "Cumprido";
    case "missed":
      return `Estourou em ${formatDuration(c.remainingMs)}`;
  }
}

// ---------------------------------------------------------------------------
// Métricas agregadas (dashboard)
// ---------------------------------------------------------------------------

export type SlaSummary = {
  open: number;
  breached: number;
  atRisk: number;
  paused: number;
  /** Concluídos nos últimos `windowDays` dias. */
  concluded: number;
  /** % dos concluídos que cumpriram resposta E resolução (null = sem dados). */
  compliancePct: number | null;
  avgFirstResponseMs: number | null;
  avgResolutionMs: number | null;
};

export function summarizeSla(
  tickets: SlaTicket[],
  policies: SlaPolicies,
  now: Date,
  windowDays = 30,
): SlaSummary {
  const since = now.getTime() - windowDays * 86_400_000;
  const s: SlaSummary = {
    open: 0,
    breached: 0,
    atRisk: 0,
    paused: 0,
    concluded: 0,
    compliancePct: null,
    avgFirstResponseMs: null,
    avgResolutionMs: null,
  };

  let compliant = 0;
  let respSum = 0;
  let respN = 0;
  let resSum = 0;
  let resN = 0;

  for (const t of tickets) {
    const r = computeSla(t, policies[t.priority], now);

    if (!t.resolvedAt) {
      s.open++;
      const w = worstClock(r);
      if (w.state === "breached") s.breached++;
      else if (w.state === "at_risk") s.atRisk++;
      else if (w.state === "paused") s.paused++;
      continue;
    }

    if (t.resolvedAt.getTime() < since) continue;
    s.concluded++;
    if (r.response.state === "met" && r.resolution.state === "met") compliant++;

    if (t.firstResponseAt) {
      respSum += t.firstResponseAt.getTime() - t.createdAt.getTime();
      respN++;
    }
    // Tempo efetivo de resolução: desconta o tempo em "Aguardando".
    resSum +=
      t.resolvedAt.getTime() - t.createdAt.getTime() - t.slaPausedSeconds * 1000;
    resN++;
  }

  if (s.concluded > 0) s.compliancePct = Math.round((compliant / s.concluded) * 100);
  if (respN > 0) s.avgFirstResponseMs = respSum / respN;
  if (resN > 0) s.avgResolutionMs = resSum / resN;
  return s;
}
