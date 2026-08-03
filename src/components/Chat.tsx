"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type ChatResponse = {
  messages: Message[];
  error?: string;
};

const SUGGESTIONS = [
  "Ei, conta uma coisa engraçada do teu dia",
  "Fala de ti, como é teu apartamento?",
  "Você é real?",
  "Me manda uma cantada",
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inicia sempre dark (igual ao SSR) e corrige após o mount para evitar hydration mismatch.
  const [dark, setDark] = useState<boolean>(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Mantém o foco na caixa de texto: no primeiro carregamento e sempre que o envio termina
  // (loading volta a false), para não precisar clicar com o mouse pra digitar de novo.
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  // Lê a preferência salva ou do sistema uma única vez no mount.
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) {
      setDark(saved === "dark");
    } else {
      setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aplica/remove a classe .dark no <html> conforme o tema escolhido.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      if (!res.ok) throw new Error(`Falha ao carregar: ${res.status}`);
      const data = (await res.json()) as ChatResponse;
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar mensagens.");
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });

      const data = (await res.json()) as ChatResponse;

      if (data.messages) {
        setMessages(data.messages);
      }

      if (!res.ok) {
        setError(
          data.error ?? "Não consegui responder agora. Tente novamente em instantes."
        );
      }
    } catch {
      setError("Falha de rede. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("Zerar a conversa? A Pollianne vai esquecer de tudo.")) return;
    try {
      const res = await fetch("/api/chat", { method: "DELETE" });
      const data = (await res.json()) as ChatResponse;
      if (!res.ok) {
        setError(data.error ?? "Falha ao resetar a conversa.");
        return;
      }
      setMessages([]);
      setError(null);
    } catch {
      setError("Falha de rede ao resetar a conversa.");
    }
  }

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
      {/* Halos decorativos de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-fuchsia-400/25 blur-3xl dark:bg-fuchsia-500/15"
        style={{ animation: "haloDrift 14s ease-in-out infinite" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-[-10%] h-[28rem] w-[28rem] rounded-full bg-violet-400/25 blur-3xl dark:bg-violet-500/15"
        style={{ animation: "haloDrift 18s ease-in-out infinite reverse" }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-zinc-200/70 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4 dark:border-zinc-800/70">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-violet-600 font-serif text-xl font-bold text-white shadow-lg shadow-fuchsia-500/30">
              P
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400 dark:border-zinc-900" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-zinc-900 sm:text-lg dark:text-zinc-50">
              Pollianne Bitencourt
            </h1>
            <p className="truncate text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
              {loading ? "digitando..." : "online · responde na hora"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDark((prev) => !prev)}
            title={dark ? "Modo claro" : "Modo escuro"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-900/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-100/10 dark:hover:text-zinc-50"
          >
            {dark ? (
              /* Sol */
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              /* Lua */
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="Zerar a memória"
            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span className="hidden sm:inline">Resetar</span>
          </button>
        </div>
      </header>

      {/* Mensagens */}
      <div className="relative z-10 flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6">
        {messages.length === 0 && !loading ? (
          <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-5 py-14 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-violet-600 font-serif text-4xl font-bold text-white shadow-2xl shadow-fuchsia-500/40">
              P
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Oi, eu sou a Pollianne 👋
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Fala comigo — conversa boa, papo reto e sem enrolação.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="rounded-full border border-zinc-300/80 bg-white/60 px-3.5 py-1.5 text-xs text-zinc-600 transition-all hover:-translate-y-0.5 hover:border-fuchsia-400 hover:text-fuchsia-600 hover:shadow-md hover:shadow-fuchsia-500/10 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:border-fuchsia-500 dark:hover:text-fuchsia-400"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex items-end gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              style={{ animation: "fadeIn 0.25s ease-out" }}
            >
              {message.role === "assistant" && (
                <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-violet-600 text-sm font-bold text-white">
                  P
                </div>
              )}
              <div
                className={`max-w-[78%] whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed sm:max-w-[65%] ${
                  message.role === "user"
                    ? "rounded-2xl rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/20"
                    : index === messages.length - 1
                      ? "rounded-2xl rounded-bl-md bg-surface text-zinc-800 shadow-sm ring-1 ring-zinc-200/70 dark:text-zinc-100 dark:ring-zinc-700/50"
                      : "rounded-2xl rounded-bl-md bg-surface text-zinc-800 shadow-sm ring-1 ring-zinc-200/70 dark:text-zinc-100 dark:ring-zinc-700/50"
                }`}
              >
                {message.content}
              </div>
              {message.role === "user" && (
                <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-200 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  EU
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-end gap-2.5" style={{ animation: "fadeIn 0.2s ease-out" }}>
            <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-violet-600 text-sm font-bold text-white">
              P
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-surface px-4 py-3.5 shadow-sm ring-1 ring-zinc-200/70 dark:ring-zinc-700/50">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-2 w-2 animate-bounce rounded-full bg-fuchsia-400"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="mx-auto rounded-full bg-red-500/10 px-4 py-1.5 text-center text-xs font-medium text-red-500">
            {error}
          </p>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex items-center gap-2 border-t border-zinc-200/70 bg-white/60 px-4 py-3 backdrop-blur-md sm:gap-3 sm:px-6 sm:py-4 dark:border-zinc-800/70 dark:bg-zinc-900/40"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Escreve pra ela..."
          disabled={loading}
          className="flex-1 rounded-full border border-zinc-300/80 bg-white/70 px-4 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/20 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-fuchsia-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30 transition-all hover:scale-105 hover:shadow-fuchsia-600/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          title="Enviar"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-px" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4Z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
