import {
  ACCEPT_ATTR,
  ALLOWED_EXTENSIONS,
  MAX_FILES,
  MAX_FILE_BYTES,
} from "@/lib/attachments";

/** Campo de anexos (input nativo, funciona dentro de qualquer <form action>). */
export function AttachmentField({ id = "files" }: { id?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        Anexos <span className="font-normal text-zinc-500">(opcional)</span>
      </label>
      <input
        id={id}
        name="files"
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-zinc-200"
      />
      <p className="text-xs text-zinc-500">
        Até {MAX_FILES} arquivos de {MAX_FILE_BYTES / 1024 / 1024} MB (
        {ALLOWED_EXTENSIONS.join(", ")}).
      </p>
    </div>
  );
}
