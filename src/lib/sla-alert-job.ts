/**
 * Job dos alertas de SLA. Sem "server-only" e recebendo o cliente do Prisma
 * por parâmetro de propósito: roda tanto dentro do Next (rota de cron) quanto
 * fora dele (npm run sla:check). Cada execução é IDEMPOTENTE: o que já foi
 * avisado fica na tabela SlaAlert, então repetir não avisa duas vezes.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { policiesFromRows, type SlaPolicies } from "@/lib/sla";
import {
  planSlaAlerts,
  slaAlertMessage,
  slaRecipients,
  type Staff,
} from "@/lib/sla-alerts";

export type SlaAlertRun = {
  /** Chamados em aberto examinados. */
  checked: number;
  /** Alertas NOVOS registrados (os repetidos não contam). */
  alerts: number;
  /** Notificações criadas para a equipe. */
  notifications: number;
};

const BATCH = 200;

export async function runSlaAlertCheck(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<SlaAlertRun> {
  const run: SlaAlertRun = { checked: 0, alerts: 0, notifications: 0 };

  // Por organização: metas e equipe ativa, buscadas uma vez por execução.
  const policiesCache = new Map<string, SlaPolicies>();
  const staffCache = new Map<string, Staff[]>();

  const policiesOf = async (organizationId: string) => {
    let p = policiesCache.get(organizationId);
    if (!p) {
      p = policiesFromRows(await prisma.slaPolicy.findMany({ where: { organizationId } }));
      policiesCache.set(organizationId, p);
    }
    return p;
  };
  const staffOf = async (organizationId: string) => {
    let s = staffCache.get(organizationId);
    if (!s) {
      // Só equipe ATIVA: quem foi desativado não recebe (nem é "dono").
      const users = await prisma.user.findMany({
        where: { organizationId, active: true, role: { in: ["ADMIN", "AGENT"] } },
        select: { id: true, role: true },
      });
      s = users.map((u) => ({ id: u.id, role: u.role as Staff["role"] }));
      staffCache.set(organizationId, s);
    }
    return s;
  };

  // Chamados em aberto, em lotes (cursor por id), sem carregar tudo na memória.
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.ticket.findMany({
      where: { resolvedAt: null },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        number: true,
        organizationId: true,
        assigneeId: true,
        priority: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        firstResponseAt: true,
        slaPausedAt: true,
        slaPausedSeconds: true,
      },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const ticket of batch) {
      run.checked++;
      const policies = await policiesOf(ticket.organizationId);
      const candidates = planSlaAlerts(ticket, policies[ticket.priority], now);
      if (candidates.length === 0) continue;

      const staff = await staffOf(ticket.organizationId);

      // Alertas e notificações no MESMO commit. `skipDuplicates` devolve só o
      // que foi inserido agora: o que já tinha sido avisado não gera nada, e
      // duas execuções simultâneas não avisam duas vezes.
      await prisma.$transaction(async (tx) => {
        const created = await tx.slaAlert.createManyAndReturn({
          data: candidates.map((c) => ({
            ticketId: ticket.id,
            clock: c.clock,
            state: c.state,
            dueAt: c.dueAt,
          })),
          skipDuplicates: true,
          select: { clock: true, state: true, dueAt: true },
        });
        run.alerts += created.length;

        const notifications = created.flatMap((alert) => {
          const candidate = candidates.find(
            (c) =>
              c.clock === alert.clock &&
              c.state === alert.state &&
              c.dueAt.getTime() === alert.dueAt.getTime(),
          )!;
          const message = slaAlertMessage({
            number: ticket.number,
            clock: candidate.clock,
            state: candidate.state,
            remainingMs: candidate.remainingMs,
          });
          return slaRecipients({
            state: candidate.state,
            assigneeId: ticket.assigneeId,
            staff,
          }).map((userId) => ({
            userId,
            ticketId: ticket.id,
            type: "SLA" as const,
            message,
          }));
        });

        if (notifications.length > 0) {
          await tx.notification.createMany({ data: notifications });
          run.notifications += notifications.length;
        }
      });
    }
  }

  return run;
}
