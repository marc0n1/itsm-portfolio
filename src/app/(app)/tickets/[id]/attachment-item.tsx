"use client";

import { useRef } from "react";
import { removeAttachment } from "../actions";

/** Miniatura da imagem; o clique abre uma visualização maior (<dialog> nativo). */
export function ImageThumb({ src, alt }: { src: string; alt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Ampliar ${alt}`}
        className="block overflow-hidden rounded-md border border-zinc-200"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-20 w-28 object-cover"
        />
      </button>
      <dialog
        ref={dialog}
        onClick={(e) => {
          // Clique fora da imagem (no fundo do dialog) fecha.
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto max-h-[90vh] max-w-[90vw] rounded-lg bg-white p-2 backdrop:bg-black/60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[80vh] max-w-full object-contain"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
          >
            Fechar
          </button>
        </div>
      </dialog>
    </>
  );
}

export function RemoveAttachmentButton({
  ticketId,
  attachmentId,
  filename,
}: {
  ticketId: string;
  attachmentId: string;
  filename: string;
}) {
  return (
    <form
      action={removeAttachment}
      onSubmit={(e) => {
        if (!window.confirm(`Remover o anexo "${filename}"? Isso não pode ser desfeito.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <button
        type="submit"
        aria-label={`Remover ${filename}`}
        className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
      >
        Remover
      </button>
    </form>
  );
}
