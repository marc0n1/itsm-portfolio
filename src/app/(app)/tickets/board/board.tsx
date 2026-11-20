"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Priority, TicketStatus } from "@/generated/prisma/enums";
import { STATUSES, STATUS_LABEL, STATUS_STYLE } from "@/lib/tickets";
import { PriorityBadge } from "../../badges";
import { CLOCK_STYLE } from "../../sla-badge";
import type { ClockState } from "@/lib/sla";
import { moveTicket } from "../actions";

export type BoardTicket = {
  id: string;
  number: number;
  title: string;
  status: TicketStatus;
  priority: Priority;
  assignee: string | null;
  service: string | null;
  sla: { state: ClockState; text: string };
};

/**
 * A coluna alvo é a que está sob o ponteiro. O padrão do dnd-kit
 * (rectIntersection) compara proporção de área e favorece colunas baixas,
 * soltando o card na coluna vizinha. Só cai nele se o ponteiro estiver fora
 * de todas as colunas (ex.: arrasto pelo teclado).
 */
const columnCollision: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

export function Board({ tickets }: { tickets: BoardTicket[] }) {
  // O card muda de coluna na hora; se o servidor recusar, volta sozinho.
  const [items, applyMove] = useOptimistic(
    tickets,
    (state, move: { id: string; status: TicketStatus }) =>
      state.map((t) => (t.id === move.id ? { ...t, status: move.status } : t)),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // Só inicia o arrasto após mover alguns pixels: cliques continuam
    // funcionando nos links e no seletor do card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function move(id: string, status: TicketStatus) {
    const ticket = items.find((t) => t.id === id);
    if (!ticket || ticket.status === status) return;

    setError(null);
    startTransition(async () => {
      applyMove({ id, status });
      const result = await moveTicket(id, status);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível mover o chamado.");
      }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (e.over) move(String(e.active.id), e.over.id as TicketStatus);
  }

  const active = items.find((t) => t.id === activeId) ?? null;

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <DndContext
        // id fixo: sem ele o dnd-kit gera ids sequenciais que diferem entre
        // servidor e navegador (erro de hidratação).
        id="kanban-board"
        sensors={sensors}
        collisionDetection={columnCollision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex items-stretch gap-3 overflow-x-auto pb-3">
          {STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              tickets={items.filter((t) => t.status === status)}
              onMove={move}
            />
          ))}
        </div>

        <DragOverlay>
          {active ? <CardView ticket={active} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  tickets,
  onMove,
}: {
  status: TicketStatus;
  tickets: BoardTicket[];
  onMove: (id: string, status: TicketStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${status}`}
      aria-label={STATUS_LABEL[status]}
      className={`min-h-96 w-64 shrink-0 rounded-lg border p-2 transition-colors ${
        isOver ? "border-indigo-400 bg-indigo-50" : "border-zinc-200 bg-zinc-100"
      }`}
    >
      <header className="mb-2 flex items-center justify-between px-1">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
        <span className="text-xs text-zinc-500">{tickets.length}</span>
      </header>

      <div className="min-h-24 space-y-2">
        {tickets.map((t) => (
          <DraggableCard key={t.id} ticket={t} onMove={onMove} />
        ))}
        {tickets.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-zinc-400">
            Solte um chamado aqui
          </p>
        )}
      </div>
    </section>
  );
}

function DraggableCard({
  ticket,
  onMove,
}: {
  ticket: BoardTicket;
  onMove: (id: string, status: TicketStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-30" : undefined}
    >
      <CardView ticket={ticket} onMove={onMove} />
    </div>
  );
}

function CardView({
  ticket,
  onMove,
  dragging,
}: {
  ticket: BoardTicket;
  onMove?: (id: string, status: TicketStatus) => void;
  dragging?: boolean;
}) {
  return (
    <article
      data-testid="card"
      className={`cursor-grab space-y-2 rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-sm ${
        dragging ? "rotate-1 shadow-lg" : ""
      }`}
    >
      <p className="text-xs text-zinc-500">
        #{ticket.number}
        {ticket.service && <> · {ticket.service}</>}
      </p>

      <Link
        href={`/tickets/${ticket.id}`}
        className="block font-medium text-indigo-700 hover:underline"
      >
        {ticket.title}
      </Link>

      <div className="flex items-center justify-between gap-2">
        <PriorityBadge priority={ticket.priority} />
        <span className="truncate text-xs text-zinc-500">
          {ticket.assignee ?? "Sem responsável"}
        </span>
      </div>

      <p
        data-sla-state={ticket.sla.state}
        className={`rounded px-2 py-1 text-xs font-medium ${CLOCK_STYLE[ticket.sla.state]}`}
      >
        {ticket.sla.text}
      </p>

      {onMove && (
        // Alternativa ao arrastar: funciona no teclado e no celular.
        <select
          aria-label={`Mover chamado ${ticket.number} para`}
          value={ticket.status}
          onChange={(e) => onMove(ticket.id, e.target.value as TicketStatus)}
          className="w-full rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-600"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}
