import { getCurrentUser } from "@/lib/dal";
import { canWorkTickets } from "@/lib/permissions";
import { getSlaPolicies } from "@/lib/sla-queries";
import { CSV_BOM, toCsv } from "@/lib/csv";
import {
  CSV_HEADERS,
  EXPORT_LIMIT,
  parseReportFilters,
  reportFilename,
  ticketCsvRow,
} from "@/lib/reports";
import { countReportTickets, listReportTickets } from "@/lib/report-queries";

/** Texto simples de erro (o download não tem página para mostrar mensagens). */
const fail = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

export async function GET(req: Request) {
  // Mesma regra das páginas: o proxy só olha o cookie; aqui confere no banco.
  const user = await getCurrentUser();
  if (!user) return fail("Não autenticado.", 401);
  if (!canWorkTickets(user.role)) return fail("Sem permissão.", 403);

  const parsed = parseReportFilters(new URL(req.url).searchParams);
  if ("error" in parsed) return fail(parsed.error, 400);
  const { filters } = parsed;

  const total = await countReportTickets(user, filters);
  if (total > EXPORT_LIMIT) {
    return fail(
      `São ${total} chamados; o limite por exportação é ${EXPORT_LIMIT}. Reduza o período ou aplique mais filtros.`,
      413,
    );
  }

  const [tickets, policies] = await Promise.all([
    listReportTickets(user, filters),
    getSlaPolicies(user.organizationId),
  ]);

  const now = new Date();
  const csv = toCsv(
    CSV_HEADERS,
    tickets.map((t) => ticketCsvRow(t, policies[t.priority], now)),
  );

  return new Response(CSV_BOM + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFilename(filters, now)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
