import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { listTickets } from "@/lib/ticket-queries";
import { PRIORITY_RANK } from "@/lib/ticket-status";
import { ticketFiltersSchema } from "@/lib/tickets";
import { Board, type BoardTicket } from "./board";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function BoardPage(props: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
      <BoardContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function BoardContent({ searchParams }: { searchParams: SearchParams }) {
  // O quadro é da equipe de atendimento; solicitantes usam a lista.
  const user = await requireRole("ADMIN", "AGENT");
  const raw = await searchParams;
  const mine = (Array.isArray(raw.mine) ? raw.mine[0] : raw.mine) === "1";

  const filters = ticketFiltersSchema.parse({ mine: mine ? "1" : undefined });
  const rows = await listTickets(user, filters);

  const tickets: BoardTicket[] = rows
    // Mais urgentes primeiro; dentro da mesma prioridade, os mais antigos.
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .map((t) => ({
      id: t.id,
      number: t.number,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee?.name ?? null,
      service: t.service?.name ?? null,
    }));

  const tab =
    "rounded-md px-3 py-1.5 text-sm border border-zinc-300 hover:bg-zinc-100";
  const tabActive = "rounded-md px-3 py-1.5 text-sm bg-indigo-600 text-white";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Quadro</h1>
          <p className="text-sm text-zinc-500">
            Arraste os cards entre as colunas para mudar o status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/tickets/board" className={mine ? tab : tabActive}>
            Todos
          </Link>
          <Link href="/tickets/board?mine=1" className={mine ? tabActive : tab}>
            Atribuídos a mim
          </Link>
        </div>
      </div>

      <Board tickets={tickets} />
    </div>
  );
}
