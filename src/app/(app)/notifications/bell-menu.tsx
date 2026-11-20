"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const REFRESH_MS = 30_000;

/**
 * Casca interativa do sino: abre/fecha o painel, fecha ao navegar ou clicar
 * fora (ou Esc) e re-busca os dados do servidor de tempos em tempos, já que
 * os avisos são criados por ações de OUTRAS pessoas.
 */
export function BellMenu({
  unread,
  children,
}: {
  unread: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Navegou (ex.: abriu um chamado a partir de um aviso): fecha o painel.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={
          unread > 0 ? `Notificações, ${unread} não lidas` : "Notificações"
        }
        className="relative rounded-md border border-zinc-300 px-2.5 py-1.5 hover:bg-zinc-100"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span
            data-testid="unread-count"
            className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-medium leading-5 text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notifications-panel"
          className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}
