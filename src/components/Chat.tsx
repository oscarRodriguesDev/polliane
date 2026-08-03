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

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
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
          data.error ??
            "Não consegui responder agora. Tente novamente em instantes."
        );
      }
    } catch {
      setError("Falha de rede. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-1 flex-col">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Pollianne Bitencourt
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Uma conversa leve, profunda e memorável.
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
        {messages.length === 0 && !loading ? (
          <p className="text-center text-sm text-zinc-400">
            Comece a conversa... ela adora ouvir.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "self-end max-w-[75%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2 text-sm text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  : "self-start max-w-[75%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
              }
            >
              {message.content}
            </div>
          ))
        )}

        {loading && (
          <div className="self-start rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2 text-sm text-zinc-400 dark:bg-zinc-800">
            Pollianne está pensando...
          </div>
        )}

        {error && (
          <p className="text-center text-sm text-red-500">{error}</p>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800"
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Escreva para a Pollianne..."
          disabled={loading}
          className="flex-1 rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-zinc-50 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
