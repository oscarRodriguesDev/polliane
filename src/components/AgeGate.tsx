"use client";

import { useEffect, useState } from "react";

// Age-gate: bloqueia o site até a pessoa confirmar que tem 18+. Guarda a
// confirmação no localStorage pra não pedir toda visita. Compliance com a regra
// BR (ECA Digital) — conteúdo adulto exige verificação de maioridade.
export default function AgeGate({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setConfirmed(localStorage.getItem("age_ok_18") === "1");
    } catch {
      setConfirmed(false);
    }
    setLoaded(true);
  }, []);

  function accept() {
    try {
      localStorage.setItem("age_ok_18", "1");
    } catch {
      // sem storage (modo privado etc.) — segue navegando mesmo assim
    }
    setConfirmed(true);
  }

  if (!loaded) return null;

  if (confirmed) return <>{children}</>;

  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-10 text-center">
      <img
        src="/polli/leves/profile.jpeg"
        alt="Foto da Pollianne"
        className="h-24 w-24 rounded-3xl object-cover shadow-2xl shadow-fuchsia-500/40"
      />
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Conteúdo adulto 🔞
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Este site contém conteúdo adulto/sensual e é destinado exclusivamente a
          maiores de 18 anos. A Pollianne é uma personagem virtual fictícia.
        </p>
      </div>
      <button
        type="button"
        onClick={accept}
        className="rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-600/30 transition-all hover:scale-105 hover:shadow-fuchsia-600/50"
      >
        Tenho 18 anos ou mais — entrar
      </button>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Se você ainda não tem 18 anos, por favor saia deste site.
      </p>
    </main>
  );
}