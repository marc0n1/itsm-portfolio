import { LoginForm } from "./login-form";

const DEMO_USERS = [
  { label: "Administrador", email: "admin@demo.com" },
  { label: "Agente", email: "agente@demo.com" },
  { label: "Solicitante", email: "solicitante@demo.com" },
];

// Página estática: quem já está logado é redirecionado pelo proxy.ts.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Central de Chamados</h1>
          <p className="text-sm text-zinc-500">Entre para continuar</p>
        </div>

        <LoginForm />

        <div className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
          <p className="mb-1 font-medium">Contas de demonstração</p>
          <ul className="space-y-0.5">
            {DEMO_USERS.map((u) => (
              <li key={u.email}>
                {u.label}: <span className="font-mono">{u.email}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Senha: <span className="font-mono">demo1234</span>
          </p>
        </div>
      </div>
    </main>
  );
}
