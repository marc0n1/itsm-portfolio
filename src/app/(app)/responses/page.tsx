import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { listResponses } from "@/lib/response-queries";
import { CreateResponseForm } from "./response-forms";

export default function ResponsesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Respostas prontas</h1>
        <p className="text-sm text-zinc-500">
          Modelos de comentário para a equipe. No chamado, escolha um modelo e o
          texto entra no campo, pronto para editar antes de enviar.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
        <ResponsesContent />
      </Suspense>
    </div>
  );
}

async function ResponsesContent() {
  const user = await requireRole("ADMIN", "AGENT");
  const responses = await listResponses(user);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        {responses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
            Nenhuma resposta pronta ainda. Crie a primeira ao lado.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {responses.map((r) => (
              <li
                key={r.id}
                data-testid="response-item"
                className="flex items-start justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">{r.title}</p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-zinc-500">
                    {r.body}
                  </p>
                </div>
                <Link
                  href={`/responses/${r.id}`}
                  aria-label={`Editar ${r.title}`}
                  className="shrink-0 text-sm text-indigo-600 hover:underline"
                >
                  Editar
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="h-fit space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-medium">Nova resposta</h2>
        <CreateResponseForm />
      </section>
    </div>
  );
}
