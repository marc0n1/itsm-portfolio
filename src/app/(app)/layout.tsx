import { Suspense } from "react";
import { AppHeader } from "./app-header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Cookie é dado de runtime: o cabeçalho fica em <Suspense>. */}
      <Suspense
        fallback={<div className="h-14 border-b border-zinc-200 bg-white" />}
      >
        <AppHeader />
      </Suspense>
      <div className="mx-auto max-w-5xl p-6">{children}</div>
    </div>
  );
}
