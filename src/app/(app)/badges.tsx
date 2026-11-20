import type { Priority, TicketStatus } from "@/generated/prisma/enums";
import {
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
} from "@/lib/tickets";

const base = "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium";

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`${base} ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`${base} ${PRIORITY_STYLE[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
