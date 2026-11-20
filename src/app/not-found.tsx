import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-zinc-500">
        O endereço não existe ou você não tem acesso a este conteúdo.
      </p>
      <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
        Voltar ao painel
      </Link>
    </main>
  );
}
