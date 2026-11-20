/** Regras puras de paginação (sem I/O): fáceis de testar. */

export const PAGE_SIZE = 20;
/** Teto só para um `?page=` absurdo não gerar um `skip` gigante no banco. */
const MAX_PAGE = 100_000;

/** `?page=` vindo da URL: qualquer coisa que não seja inteiro >= 1 vira 1. */
export function parsePage(raw: string | undefined | null): number {
  if (!raw || !/^\d{1,6}$/.test(raw)) return 1;
  const n = Number(raw);
  return n >= 1 ? Math.min(n, MAX_PAGE) : 1;
}

export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  skip: number;
  /** Posição (1-based) do primeiro/último item exibido; 0 se não há itens. */
  from: number;
  to: number;
};

/**
 * Normaliza a página pedida contra o total: uma página além do fim (ex.: o
 * último item foi removido, ou `?page=99`) cai na última, nunca numa tela vazia.
 */
export function paginate(input: {
  page: number;
  total: number;
  pageSize?: number;
}): PageInfo {
  const pageSize = input.pageSize ?? PAGE_SIZE;
  const total = Math.max(0, input.total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);
  const skip = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    total,
    totalPages,
    skip,
    from: total === 0 ? 0 : skip + 1,
    to: Math.min(skip + pageSize, total),
  };
}

export type PageToken = number | "gap";

/**
 * Números a exibir: sempre a primeira, a última e a vizinhança da atual;
 * os intervalos omitidos viram "gap" (reticências). Ex.: 1 … 4 5 6 … 20.
 */
export function pageWindow(
  page: number,
  totalPages: number,
  siblings = 1,
): PageToken[] {
  const keep = new Set<number>([1, totalPages]);
  for (let p = page - siblings; p <= page + siblings; p++) {
    if (p >= 1 && p <= totalPages) keep.add(p);
  }
  const sorted = [...keep].sort((a, b) => a - b);

  const out: PageToken[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined) {
      // Um único número omitido vale mais mostrar do que "…".
      if (p - prev === 2) out.push(prev + 1);
      else if (p - prev > 2) out.push("gap");
    }
    out.push(p);
  });
  return out;
}

/** Link de uma página preservando os filtros; a página 1 não leva `?page=`. */
export function ticketsHref(
  filters: { status?: string; priority?: string; q?: string; mine?: string },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.mine) params.set("mine", filters.mine);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/tickets?${qs}` : "/tickets";
}
