"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  bubbles?: string[];
  createdAt: string;
};

type ChatResponse = {
  messages: Message[];
  error?: string;
};

type Provider = "openai" | "deepseek" | "grok";

const SUGGESTIONS = [
  "Ei, conta uma coisa engraçada do teu dia",
  "Fala de ti, como é teu apartamento?",
  "Você é real?",
  "Me manda uma cantada",
];

// Atrasa a aparição de cada balão por um tempo ALEATÓRIO de 0 a 10 segundos,
// simulando uma pessoa que digita sem ritmo fixo (menos "fake").
function randomDelayMs(): number {
  return Math.floor(Math.random() * 10000);
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Quantos balões de cada mensagem do bot já "apareceram" (revelação progressiva).
  const [revealed, setRevealed] = useState<Record<number, number>>({});
  // True enquanto os balões da resposta estão sendo revelados (mostra "digitando").
  const [revealing, setRevealing] = useState(false);
  // Inicia sempre dark (igual ao SSR) e corrige após o mount para evitar hydration mismatch.
  const [dark, setDark] = useState<boolean>(true);
  // Provedor de IA: "openai" (gpt-4o-mini, mais moderado) ou "deepseek" (sem travas, mais picante).
  const [provider, setProvider] = useState<Provider>("openai");
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Último id de mensagem do bot que já foi revelado (evita animar no load inicial).
  const lastRevealedIdRef = useRef<number | null>(null);

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

  // Lê o provedor salvo no mount.
  useEffect(() => {
    const saved = localStorage.getItem("provider");
    if (saved === "deepseek" || saved === "openai" || saved === "grok") {
      setProvider(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste a escolha de provedor.
  useEffect(() => {
    localStorage.setItem("provider", provider);
  }, [provider]);

  // Aplica/remove a classe .dark no <html> conforme o tema escolhido.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // Revelação progressiva: quando chega uma resposta nova do bot com vários
  // balões, mostra um a um (com pequeno delay) em vez de tudo de uma vez.
  useEffect(() => {
    if (loading) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const bubbles = Array.isArray(lastAssistant.bubbles)
      ? lastAssistant.bubbles.length
      : 1;

    // Só anima se for uma mensagem nova que ainda não passou pela revelação.
    if (lastRevealedIdRef.current === lastAssistant.id) {
      setRevealed((r) => ({ ...r, [lastAssistant.id]: bubbles }));
      return;
    }

    if (bubbles <= 1) {
      setRevealed((r) => ({ ...r, [lastAssistant.id]: bubbles }));
      lastRevealedIdRef.current = lastAssistant.id;
      return;
    }

    // Começa fechado (mostra só o indicador de digitando por um instante).
    setRevealed((r) => ({ ...r, [lastAssistant.id]: 0 }));
    setRevealing(true);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reveal = (n: number) => {
      setRevealed((r) => ({ ...r, [lastAssistant.id]: n }));
    };
    // Cada balão tem um delay ALEATÓRIO (0 a 10s), acumulado sobre o anterior.
    let acc = 400;
    for (let i = 0; i < bubbles; i++) {
      acc += randomDelayMs();
      timers.push(
        setTimeout(() => {
          reveal(i + 1);
          endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }, acc)
      );
    }
    timers.push(
      setTimeout(() => {
        lastRevealedIdRef.current = lastAssistant.id;
        setRevealing(false);
      }, acc + 100)
    );
    return () => timers.forEach(clearTimeout);
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
        body: JSON.stringify({ message: content, provider }),
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

  function cycleProvider() {
    setProvider((prev) =>
      prev === "openai" ? "deepseek" : prev === "deepseek" ? "grok" : "openai"
    );
  }

  const providerLabel: Record<Provider, string> = {
    openai: "OpenAI",
    deepseek: "DeepSeek",
    grok: "Grok",
  };

  const providerInfo: Record<Provider, string> = {
    openai: "OpenAI: respostas naturais e moderadas.",
    deepseek: "DeepSeek: sem travas, mais picante.",
    grok: "Grok (OpenRouter): inteligente e picante.",
  };

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
      setRevealed({});
      lastRevealedIdRef.current = null;
      setError(null);
    } catch {
      setError("Falha de rede ao resetar a conversa.");
    }
  }

  // ID da última resposta do bot — a única que é revelada balão a balão.
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden">
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
            <img
              src="/polli/leves/profile.jpeg"
              alt="Foto da Pollianne"
              className="h-11 w-11 rounded-2xl object-cover shadow-lg shadow-fuchsia-500/30"
            />
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
            onClick={cycleProvider}
            title={providerInfo[provider] + " Clique para trocar o motor de IA."}
            className={
              "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors sm:px-3.5 " +
              (provider === "grok"
                ? "bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-600 ring-1 ring-amber-400/40 hover:bg-amber-500/20 dark:text-amber-400 dark:ring-amber-500/40"
                : provider === "deepseek"
                  ? "bg-gradient-to-r from-fuchsia-500/15 to-violet-500/15 text-fuchsia-600 ring-1 ring-fuchsia-400/40 hover:bg-fuchsia-500/20 dark:text-fuchsia-400 dark:ring-fuchsia-500/40"
                  : "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-300/70 hover:bg-zinc-200/70 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700")
            }
          >
            <span
              className={
                "h-1.5 w-1.5 rounded-full " +
                (provider === "grok"
                  ? "bg-amber-500"
                  : provider === "deepseek"
                    ? "bg-fuchsia-500"
                    : "bg-zinc-400 dark:bg-zinc-500")
              }
            />
            <span className="hidden sm:inline">{providerLabel[provider]}</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8 9l-4 4 4 4" />
              <path d="M16 9l4 4-4 4" />
            </svg>
          </button>
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
            <img
              src="/polli/leves/profile.jpeg"
              alt="Foto da Pollianne"
              className="h-20 w-20 rounded-3xl object-cover shadow-2xl shadow-fuchsia-500/40"
            />
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
          messages.map((message, index) => {
            // Réplica do bot pode vir em vários balões curtos (estilo WhatsApp).
            const allBubbles =
              message.role === "assistant" && Array.isArray(message.bubbles) && message.bubbles.length
                ? message.bubbles
                : [message.content];

            // Só a resposta MAIS RECENTE é revelada aos poucos; as antigas já aparecem completas.
            const shown =
              message.role === "assistant" && message.id === lastAssistantId
                ? Math.max(0, revealed[message.id] ?? allBubbles.length)
                : allBubbles.length;
            const bubbles = allBubbles.slice(0, shown);

            return (
              <div
                key={message.id}
                className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"} gap-1.5`}
                style={{ animation: "fadeIn 0.25s ease-out" }}
              >
                {bubbles.map((bubble, i) => (
                  <div
                    key={i}
                    className={`flex items-end gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {message.role === "assistant" && i === bubbles.length - 1 && (
                      <img
                        src="/polli/leves/profile.jpeg"
                        alt="Foto da Pollianne"
                        className="mb-1 h-8 w-8 shrink-0 rounded-xl object-cover"
                      />
                    )}
                    <div
                      className={`max-w-[78%] whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed sm:max-w-[65%] ${
                        message.role === "user"
                          ? "rounded-2xl rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-600/20"
                          : index === messages.length - 1 && i === bubbles.length - 1
                            ? "rounded-2xl rounded-bl-md bg-surface text-zinc-800 shadow-sm ring-1 ring-zinc-200/70 dark:text-zinc-100 dark:ring-zinc-700/50"
                            : "rounded-2xl rounded-bl-md bg-surface text-zinc-800 shadow-sm ring-1 ring-zinc-200/70 dark:text-zinc-100 dark:ring-zinc-700/50"
                      }`}
                    >
                      {bubble}
                    </div>
                    {message.role === "user" && i === bubbles.length - 1 && (
                      <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-200 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        EU
                      </div>
                    )}
                  </div>
                ))}

                {message.role === "assistant" && message.imageUrl && (
                  <div className="flex items-end gap-2.5">
                    <img
                      src="/polli/leves/profile.jpeg"
                      alt="Foto da Pollianne"
                      className="mb-1 h-8 w-8 shrink-0 rounded-xl object-cover"
                    />
                    <div className="relative flex justify-center">
                      <a
                        href={message.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir foto em tamanho maior"
                      >
                        <img
                          src={message.imageUrl}
                          alt="Foto da Pollianne"
                          className="max-h-72 w-auto max-w-full cursor-pointer rounded-2xl border border-zinc-200/70 object-cover shadow-md transition-transform hover:scale-[1.02] dark:border-zinc-700/50"
                        />
                      </a>
                      <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-zinc-900/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6" />
                          <path d="M10 14 21 3" />
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        </svg>
                        abrir
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {(loading || revealing) && (
          <div className="flex items-end gap-2.5" style={{ animation: "fadeIn 0.2s ease-out" }}>
            <img
              src="/polli/leves/profile.jpeg"
              alt="Foto da Pollianne"
              className="mb-1 h-8 w-8 shrink-0 rounded-xl object-cover"
            />
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
