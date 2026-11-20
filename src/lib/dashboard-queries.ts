import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/dal";
import { getSlaPolicies } from "@/lib/sla-queries";
import { summarizeSla } from "@/lib/sla";
import { ticketScope } from "@/lib/ticket-queries";

const TZ = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

// "2026-11-20" no fuso de São Paulo (en-CA formata como AAAA-MM-DD).
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
// "20/11" para o eixo.
const dayLabel = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
});

export type DailyCount = { key: string; label: string; count: number };

/** Chamados abertos por dia nos últimos `days` dias (hoje incluído). */
export function bucketByDay(createdAts: Date[], now: Date, days = 14): DailyCount[] {
  const counts = new Map<string, number>();
  for (const d of createdAts) {
    const k = dayKey.format(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const out: DailyCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * DAY_MS);
    const key = dayKey.format(day);
    out.push({ key, label: dayLabel.format(day), count: counts.get(key) ?? 0 });
  }
  return out;
}

/** Métricas da equipe de atendimento: SLA agregado e volume diário. */
export async function getStaffMetrics(user: CurrentUser) {
  const [policies, tickets] = await Promise.all([
    getSlaPolicies(user.organizationId),
    prisma.ticket.findMany({
      where: ticketScope(user),
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        createdAt: true,
        priority: true,
        status: true,
        resolvedAt: true,
        firstResponseAt: true,
        slaPausedAt: true,
        slaPausedSeconds: true,
      },
    }),
  ]);

  // O relógio só é lido depois dos dados dinâmicos (regra do Cache Components).
  const now = new Date();
  return {
    summary: summarizeSla(tickets, policies, now),
    daily: bucketByDay(
      tickets.map((t) => t.createdAt),
      now,
    ),
  };
}
