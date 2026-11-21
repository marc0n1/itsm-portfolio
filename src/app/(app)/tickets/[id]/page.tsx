import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { ROLE_LABEL, canWorkTickets } from "@/lib/permissions";
import { listResponses } from "@/lib/response-queries";
import { firstName } from "@/lib/responses";
import { getTicket, listAssignees, listTicketEvents } from "@/lib/ticket-queries";
import { displayAnswer, parseAnswers } from "@/lib/services";
import { computeSla, formatDuration, type SlaClock } from "@/lib/sla";
import { getSlaPolicies } from "@/lib/sla-queries";
import { SlaBadge } from "../../sla-badge";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  formatDate,
} from "@/lib/tickets";
import { PriorityBadge, StatusBadge } from "../../badges";
import { updateTicket } from "../actions";
import { CommentForm } from "./comment-form";
import { ImageThumb, RemoveAttachmentButton } from "./attachment-item";
import { RatingForm } from "./rating-form";
import { SCORE_LABEL, canRate, stars } from "@/lib/csat";
import { PREVIEWABLE, formatBytes } from "@/lib/attachments";

type Params = Promise<{ id: string }>;

export default function TicketPage(props: { params: Params }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
      <TicketContent params={props.params} />
    </Suspense>
  );
}

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500";

async function TicketContent({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();

  // getTicket aplica o escopo do usuário: chamado de outro => null => 404.
  const ticket = await getTicket(user, id);
  if (!ticket) notFound();

  const staff = canWorkTickets(user.role);
  const assignees = staff ? await listAssignees(user) : [];
  const answers = parseAnswers(ticket.formData);
  const events = await listTicketEvents(user, ticket.id);
  const responses = await listResponses(user);
  const attachmentsOf = (commentId: string | null) =>
    ticket.attachments.filter((a) => a.commentId === commentId);
  // SLA é indicador interno: só a equipe de atendimento o vê.
  const sla = staff
    ? computeSla(
        ticket,
        (await getSlaPolicies(user.organizationId))[ticket.priority],
        new Date(),
      )
    : null;

  return (
    <div className="space-y-5">
      <Link href="/tickets" className="text-sm text-indigo-600 hover:underline">
        ← Voltar para chamados
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-sm text-zinc-500">Chamado #{ticket.number}</p>
            <h1 className="text-2xl font-semibold">{ticket.title}</h1>
            <div className="flex items-center gap-2">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
          </header>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="mb-1 text-xs text-zinc-500">
              {ticket.requester.name} · {formatDate(ticket.createdAt)}
            </p>
            <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
            <AttachmentList ticketId={ticket.id} items={attachmentsOf(null)} user={{ id: user.id, staff }} />
          </section>

          {answers.length > 0 && (
            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-medium">
                Informações do serviço
                {ticket.service && (
                  <span className="font-normal text-zinc-500">
                    {" "}
                    · {ticket.service.name}
                  </span>
                )}
              </h2>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {answers.map((a) => (
                  <div key={a.key}>
                    <dt className="text-xs text-zinc-500">{a.label}</dt>
                    <dd className="whitespace-pre-wrap">{displayAnswer(a)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {canRate(ticket, user.id) && (
            <section
              data-testid="rating"
              className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4"
            >
              <div>
                <h2 className="font-medium">Como foi o atendimento?</h2>
                <p className="text-sm text-zinc-500">
                  {ticket.csatScore !== null
                    ? "Você já avaliou este chamado. Pode alterar a nota quando quiser."
                    : "Sua avaliação ajuda a equipe a melhorar."}
                </p>
              </div>
              <RatingForm
                ticketId={ticket.id}
                current={
                  ticket.csatScore !== null
                    ? { score: ticket.csatScore, comment: ticket.csatComment }
                    : null
                }
              />
            </section>
          )}

          {staff && ticket.csatScore !== null && (
            <section
              data-testid="rating-summary"
              className="space-y-1 rounded-lg border border-zinc-200 bg-white p-4"
            >
              <h2 className="text-sm font-medium">Avaliação do solicitante</h2>
              <p>
                <span aria-hidden className="text-lg text-amber-500">
                  {stars(ticket.csatScore)}
                </span>{" "}
                <span className="text-sm font-medium">
                  {ticket.csatScore} de 5 ·{" "}
                  {SCORE_LABEL[ticket.csatScore as keyof typeof SCORE_LABEL]}
                </span>
              </p>
              {ticket.csatComment && (
                <p className="whitespace-pre-wrap text-sm text-zinc-700">
                  “{ticket.csatComment}”
                </p>
              )}
              {ticket.csatAt && (
                <p className="text-xs text-zinc-500">
                  Avaliado em {formatDate(ticket.csatAt)}
                </p>
              )}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-medium">
              Comentários ({ticket.comments.length})
            </h2>

            {ticket.comments.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhum comentário ainda.</p>
            )}

            {ticket.comments.map((c) => (
              <article
                key={c.id}
                className={`rounded-lg border p-4 ${
                  c.internal
                    ? "border-amber-300 bg-amber-50"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-700">
                    {c.author.name}
                  </span>
                  <span>{ROLE_LABEL[c.author.role]}</span>
                  <span>· {formatDate(c.createdAt)}</span>
                  {c.internal && (
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-900">
                      Nota interna
                    </span>
                  )}
                </p>
                <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                <AttachmentList
                  ticketId={ticket.id}
                  items={attachmentsOf(c.id)}
                  user={{ id: user.id, staff }}
                />
              </article>
            ))}

            <CommentForm
              ticketId={ticket.id}
              staff={staff}
              responses={responses}
              vars={{
                solicitante: firstName(ticket.requester.name),
                numero: String(ticket.number),
                agente: user.name,
              }}
            />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm">
            <h2 className="font-medium">Detalhes</h2>
            <Info label="Solicitante" value={ticket.requester.name} />
            <Info label="Responsável" value={ticket.assignee?.name ?? "—"} />
            <Info label="Aberto em" value={formatDate(ticket.createdAt)} />
            <Info
              label="Resolvido em"
              value={ticket.resolvedAt ? formatDate(ticket.resolvedAt) : "—"}
            />
          </section>

          {sla && (
            <section
              data-testid="sla-panel"
              className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm"
            >
              <h2 className="font-medium">SLA</h2>
              <SlaRow
                title="Primeira resposta"
                clock={sla.response}
                note={
                  ticket.firstResponseAt
                    ? `Respondido em ${formatDate(ticket.firstResponseAt)}`
                    : undefined
                }
              />
              <SlaRow
                title="Resolução"
                clock={sla.resolution}
                note={
                  ticket.slaPausedSeconds > 0
                    ? `Tempo pausado: ${formatDuration(ticket.slaPausedSeconds * 1000)}`
                    : undefined
                }
              />
            </section>
          )}

          {staff && (
            <section
              data-testid="history"
              className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm"
            >
              <h2 className="font-medium">Histórico</h2>
              <ol className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="space-y-0.5">
                    <p>{describeEvent(e)}</p>
                    <p className="text-xs text-zinc-500">
                      {e.actor.name} · {formatDate(e.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {staff && (
            <form
              // O React reseta o form após a action; sem a key ele voltaria aos
              // valores ANTIGOS e um 2º "Salvar" desfaria a alteração.
              key={`${ticket.status}|${ticket.priority}|${ticket.assignee?.id ?? ""}`}
              action={updateTicket}
              className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm"
            >
              <h2 className="font-medium">Atendimento</h2>
              <input type="hidden" name="ticketId" value={ticket.id} />

              <label className="block space-y-1">
                <span className="text-zinc-600">Status</span>
                <select name="status" defaultValue={ticket.status} className={field}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-zinc-600">Prioridade</span>
                <select
                  name="priority"
                  defaultValue={ticket.priority}
                  className={field}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-zinc-600">Responsável</span>
                <select
                  name="assigneeId"
                  defaultValue={ticket.assignee?.id ?? ""}
                  className={field}
                >
                  <option value="">Sem responsável</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="w-full rounded-md bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-700"
              >
                Salvar alterações
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}

function AttachmentList({
  ticketId,
  items,
  user,
}: {
  ticketId: string;
  items: {
    id: string;
    filename: string;
    size: number;
    mimeType: string;
    uploaderId: string;
  }[];
  user: { id: string; staff: boolean };
}) {
  if (items.length === 0) return null;
  return (
    <ul data-testid="attachments" className="mt-3 flex flex-wrap items-start gap-3">
      {items.map((a) => {
        const href = `/tickets/${ticketId}/attachments/${a.id}`;
        // Quem enviou ou a equipe pode remover (o servidor confere de novo).
        const canRemove = user.staff || a.uploaderId === user.id;
        return (
          <li key={a.id} className="space-y-1">
            {PREVIEWABLE.has(a.mimeType) && (
              <ImageThumb src={`${href}?inline=1`} alt={a.filename} />
            )}
            <div className="flex items-center gap-1">
              <a
                href={href}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-zinc-100"
              >
                <span aria-hidden>📎</span>
                {a.filename}
                <span className="text-zinc-500">({formatBytes(a.size)})</span>
              </a>
              {canRemove && (
                <RemoveAttachmentButton
                  ticketId={ticketId}
                  attachmentId={a.id}
                  filename={a.filename}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function describeEvent(e: {
  type: string;
  from: string | null;
  to: string | null;
}) {
  const status = (v: string | null) => STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
  const priority = (v: string | null) =>
    PRIORITY_LABEL[v as keyof typeof PRIORITY_LABEL] ?? v;
  switch (e.type) {
    case "CREATED":
      return "Chamado aberto";
    case "STATUS":
      return `Status: ${status(e.from)} → ${status(e.to)}`;
    case "PRIORITY":
      return `Prioridade: ${priority(e.from)} → ${priority(e.to)}`;
    case "ATTACHMENT_REMOVED":
      return `Anexo removido: ${e.from ?? "arquivo"}`;
    case "ASSIGNEE":
      return `Responsável: ${e.from ?? "ninguém"} → ${e.to ?? "ninguém"}`;
    default:
      return e.type;
  }
}

function SlaRow({
  title,
  clock,
  note,
}: {
  title: string;
  clock: SlaClock;
  note?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-zinc-500">{title}</p>
      <SlaBadge clock={clock} />
      <p className="text-xs text-zinc-500">
        {clock.state === "paused" ? "Relógio parado" : `Prazo: ${formatDate(clock.dueAt)}`}
        {note && <> · {note}</>}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
