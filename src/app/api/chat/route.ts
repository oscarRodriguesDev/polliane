import { NextResponse } from "next/server";
import {
  addMessage,
  getOrCreateConversation,
  listMessages,
} from "@/lib/db";
import { generateReply, type HistoryMessage } from "@/lib/ai";

export const runtime = "nodejs";

// Conversa fixa e persistente (uma única conversa no app).
const DEFAULT_CONVERSATION_ID = 1;

export async function GET(): Promise<NextResponse> {
  const conversationId = getOrCreateConversation(DEFAULT_CONVERSATION_ID);
  const messages = listMessages(conversationId);
  return NextResponse.json({ messages });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { message?: unknown };

  try {
    body = (await request.json()) as { message?: unknown };
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

  const conversationId = getOrCreateConversation(DEFAULT_CONVERSATION_ID);

  addMessage(conversationId, "user", message);

  const history: HistoryMessage[] = listMessages(conversationId).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const reply = await generateReply(history);
    addMessage(conversationId, "assistant", reply);
  } catch (error) {
    console.error("Falha ao gerar resposta da IA:", error);
    return NextResponse.json(
      {
        error: "Não consegui responder agora. Tente novamente em instantes.",
        messages: listMessages(conversationId),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ messages: listMessages(conversationId) });
}
