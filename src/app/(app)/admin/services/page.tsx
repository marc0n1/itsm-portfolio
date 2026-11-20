import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { listServices } from "@/lib/service-queries";
import { PRIORITY_LABEL } from "@/lib/tickets";
import { toggleService } from "./actions";

export default function ServicesAdminPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
      <ServicesContent />
    </Suspense>
  );
}

async function ServicesContent() {
  const user = await requireRole("ADMIN");
  const services = await listServices(user);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo de serviços</h1>
          <p className="text-sm text-zinc-500">
            Cada serviço tem seu próprio formulário de abertura.
          </p>
        </div>
        <Link
          href="/admin/services/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Novo serviço
        </Link>
      </div>

      {services.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          Nenhum serviço cadastrado ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Serviço</th>
                <th className="px-4 py-2.5">Campos</th>
                <th className="px-4 py-2.5">Prioridade padrão</th>
                <th className="px-4 py-2.5">Chamados</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.name}</p>
                    {s.description && (
                      <p className="text-xs text-zinc-500">{s.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">{s.fields.length}</td>
                  <td className="px-4 py-3">
                    {PRIORITY_LABEL[s.defaultPriority]}
                  </td>
                  <td className="px-4 py-3">{s._count.tickets}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        s.active
                          ? "bg-green-100 text-green-800"
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {s.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/admin/services/${s.id}/edit`}
                        className="text-indigo-700 hover:underline"
                      >
                        Editar
                      </Link>
                      <form action={toggleService}>
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className="text-zinc-600 hover:underline"
                        >
                          {s.active ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
