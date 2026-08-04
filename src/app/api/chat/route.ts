import { NextResponse } from "next/server";
import { generateReply, type HistoryMessage, type Provider } from "@/lib/ai";

export const runtime = "nodejs";

// Conversa fixa e persistente em memória (SEM disco).
// O histórico some quando o servidor reinicia — modo de teste da personalidade.
const DEFAULT_CONVERSATION_ID = "1";

type StoredMessage = {
  id: number;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

// Store em memória: conversaId -> mensagens.
const memoryStore = new Map<string, StoredMessage[]>();

function getMessages(conversationId: string): StoredMessage[] {
  if (!memoryStore.has(conversationId)) {
    memoryStore.set(conversationId, []);
  }
  return memoryStore.get(conversationId)!;
}

function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): StoredMessage {
  const messages = getMessages(conversationId);
  const message: StoredMessage = {
    id: messages.length + 1,
    conversationId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  return message;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ messages: getMessages(DEFAULT_CONVERSATION_ID) });
}

// Reset: zera o histórico da conversa — o bot volta à estaca zero, sem memória.
export async function DELETE(): Promise<NextResponse> {
  memoryStore.set(DEFAULT_CONVERSATION_ID, []);
  return NextResponse.json({
    ok: true,
    messages: getMessages(DEFAULT_CONVERSATION_ID),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { message?: unknown; provider?: unknown };

  try {
    body = (await request.json()) as { message?: unknown; provider?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido. Envie JSON com o campo 'message'." },
      { status: 400 }
    );
  }

  const message = body.message;
  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json(
      { error: "Campo 'message' é obrigatório e deve ser uma string não vazia." },
      { status: 400 }
    );
  }

  const provider: Provider =
    body.provider === "deepseek" ? "deepseek" : body.provider === "grok" ? "grok" : "openai";

  addMessage(DEFAULT_CONVERSATION_ID, "user", message);

  const history: HistoryMessage[] = getMessages(DEFAULT_CONVERSATION_ID).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const reply = await generateReply(history, provider);
    addMessage(DEFAULT_CONVERSATION_ID, "assistant", reply);
  } catch (error) {
    console.error("Falha ao gerar resposta da IA:", error);
    return NextResponse.json(
      {
        error: "Não consegui responder agora. Tente novamente em instantes.",
        messages: getMessages(DEFAULT_CONVERSATION_ID),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ messages: getMessages(DEFAULT_CONVERSATION_ID) });
}
