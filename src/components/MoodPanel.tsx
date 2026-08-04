"use client";

import { useEffect, useState, useCallback } from "react";

type Emotions = {
  alegria: number;
  tristeza: number;
  animo: number;
  energia: number;
  ousadia: number;
  safadeza: number;
};

type StateData = {
  date: string;
  temperament: string;
  temperamentLabel: string;
  temperamentHow: string;
  emotions: Emotions;
};

const EMOTION_ORDER: { key: keyof Emotions; label: string }[] = [
  { key: "alegria", label: "Alegria" },
  { key: "tristeza", label: "Tristeza" },
  { key: "animo", label: "Ânimo" },
  { key: "energia", label: "Energia" },
  { key: "ousadia", label: "Ousadia" },
  { key: "safadeza", label: "Safadeza" },
];

function barColor(key: keyof Emotions): string {
  switch (key) {
    case "alegria":
      return "from-amber-400 to-yellow-300";
    case "tristeza":
      return "from-blue-500 to-indigo-400";
    case "animo":
      return "from-emerald-400 to-teal-300";
    case "energia":
      return "from-orange-400 to-red-300";
    case "ousadia":
      return "from-fuchsia-500 to-pink-400";
    case "safadeza":
      return "from-rose-500 to-red-400";
  }
}

function temperamentColor(temp: string): string {
  switch (temp) {
    case "melancolico":
      return "bg-blue-500/15 text-blue-600 ring-blue-400/40 dark:text-blue-300";
    case "colerico":
      return "bg-red-500/15 text-red-600 ring-red-400/40 dark:text-red-300";
    case "sanguineo":
      return "bg-amber-500/15 text-amber-600 ring-amber-400/40 dark:text-amber-300";
    case "flegmatico":
      return "bg-emerald-500/15 text-emerald-600 ring-emerald-400/40 dark:text-emerald-300";
    default:
      return "bg-zinc-500/15 text-zinc-600 ring-zinc-400/40 dark:text-zinc-300";
  }
}

export default function MoodPanel() {
  const [state, setState] = useState<StateData | null>(null);
  const [isDev, setIsDev] = useState(false);
  // Recolhido por padrão pra nunca tampar a conversa — clique pra abrir.
  const [collapsed, setCollapsed] = useState(true);

  // Só mostra o painel quando rodando em localhost (modo dev).
  useEffect(() => {
    setIsDev(
      typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1")
    );
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (res.ok) {
        setState((await res.json()) as StateData);
      }
    } catch {
      // ignora — painel é só pra dev
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function reroll() {
    try {
      const res = await fetch("/api/state?reroll=true", { method: "POST" });
      if (res.ok) {
        setState((await res.json()) as StateData);
      }
    } catch {
      // ignora
    }
  }

  if (!isDev) return null;

  return (
    <div className="fixed right-4 top-20 z-50 w-64 rounded-2xl border border-zinc-200/80 bg-white/90 p-3 shadow-xl backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/90">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Estado do dia · dev
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={reroll}
            title="Sortear novo temperamento/emoções"
            className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-zinc-100/10 dark:hover:text-zinc-200"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expandir" : "Recolher"}
            className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-zinc-100/10 dark:hover:text-zinc-200"
          >
            {collapsed ? (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m18 15-6-6-6 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {!collapsed && state && (
        <div className="space-y-2.5">
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${temperamentColor(state.temperament)}`}>
            <span className="capitalize">{state.temperamentLabel}</span>
            <span className="font-normal opacity-60">{state.date}</span>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            {state.temperamentHow}
          </p>
          <div className="space-y-1.5">
            {EMOTION_ORDER.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${barColor(key)}`}
                    style={{ width: `${state.emotions[key]}%` }}
                  />
                </div>
                <span className="w-7 shrink-0 text-right text-[11px] font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
                  {state.emotions[key]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!collapsed && !state && (
        <p className="text-[11px] text-zinc-400">Carregando estado...</p>
      )}
    </div>
  );
}