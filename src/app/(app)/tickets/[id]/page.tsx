import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { ROLE_LABEL, canWorkTickets } from "@/lib/permissions";
import { getTicket, listAssignees } from "@/lib/ticket-queries";
import { displayAnswer, parseAnswers } from "@/lib/services";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  formatDate,
} from "@/lib/tickets";
import { PriorityBadge, StatusBadge } from "../../badges";
import { addComment, updateTicket } from "../actions";

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
              </article>
            ))}

            <form action={addComment} className="space-y-2">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <textarea
                name="body"
                required
                maxLength={5000}
                rows={3}
                placeholder="Escreva um comentário..."
                className={field}
              />
              <div className="flex items-center justify-between">
                {staff ? (
                  <label className="flex items-center gap-1.5 text-sm text-zinc-700">
                    <input type="checkbox" name="internal" />
                    Nota interna (invisível ao solicitante)
                  </label>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Comentar
                </button>
              </div>
            </form>
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

          {staff && (
            <form
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
