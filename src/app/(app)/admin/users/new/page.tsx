import { Suspense } from "react";
import { requireRole } from "@/lib/dal";
import { CreateUserForm } from "../user-forms";

export default function NewUserPage() {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Novo usuário</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando...</p>}>
        <Guard />
      </Suspense>
    </div>
  );
}

async function Guard() {
  await requireRole("ADMIN");
  return <CreateUserForm />;
}
