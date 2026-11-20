import { Suspense } from "react";
import { requireRole } from "@/lib/dal";
import { ServiceForm } from "../service-form";

export default function NewServicePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">Novo serviço</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
        <Guard />
      </Suspense>
    </div>
  );
}

async function Guard() {
  await requireRole("ADMIN");
  return <ServiceForm />;
}
