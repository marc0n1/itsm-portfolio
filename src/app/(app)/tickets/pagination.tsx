import Link from "next/link";
import { pageWindow, ticketsHref, type PageInfo } from "@/lib/pagination";

type Filters = { status?: string; priority?: string; q?: string; mine?: string };

const base =
  "inline-flex min-w-8 items-center justify-center rounded-md border px-2.5 py-1 text-sm";
const enabled = `${base} border-zinc-300 bg-white hover:bg-zinc-100`;
const disabled = `${base} border-zinc-200 bg-zinc-50 text-zinc-400`;
const current = `${base} border-indigo-600 bg-indigo-600 font-medium text-white`;

export function Pagination({
  info,
  filters,
}: {
  info: PageInfo;
  filters: Filters;
}) {
  const { page, totalPages, total, from, to } = info;

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p data-testid="page-summary" className="text-sm text-zinc-600">
        Mostrando {from}–{to} de {total}
      </p>

      {totalPages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            {page > 1 ? (
              <Link href={ticketsHref(filters, page - 1)} className={enabled}>
                Anterior
              </Link>
            ) : (
              <span aria-disabled="true" className={disabled}>
                Anterior
              </span>
            )}
          </li>

          {pageWindow(page, totalPages).map((token, i) => (
            <li key={`${token}-${i}`}>
              {token === "gap" ? (
                <span aria-hidden className="px-1 text-zinc-400">
                  …
                </span>
              ) : token === page ? (
                <span aria-current="page" className={current}>
                  {token}
                </span>
              ) : (
                <Link
                  href={ticketsHref(filters, token)}
                  aria-label={`Página ${token}`}
                  className={enabled}
                >
                  {token}
                </Link>
              )}
            </li>
          ))}

          <li>
            {page < totalPages ? (
              <Link href={ticketsHref(filters, page + 1)} className={enabled}>
                Próxima
              </Link>
            ) : (
              <span aria-disabled="true" className={disabled}>
                Próxima
              </span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
