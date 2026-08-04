import { NextResponse } from "next/server";
import { generateReply, type HistoryMessage, type Provider } from "@/lib/ai";
import { generateImage } from "@/lib/image";
import { applyEmotionChange } from "@/lib/state";

export const runtime = "nodejs";

// Conversa fixa e persistente em memória (SEM disco).
// O histórico some quando o servidor reinicia — modo de teste da personalidade.
const DEFAULT_CONVERSATION_ID = "1";

type StoredMessage = {
  id: number;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
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
  content: string,
  imageUrl?: string
): StoredMessage {
  const messages = getMessages(conversationId);
  const message: StoredMessage = {
    id: messages.length + 1,
    conversationId,
    role,
    content,
    imageUrl,
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  return message;
}

// Detecta a tag [[FOTO: cena]] no fim da resposta, gera a imagem e devolve o
// texto limpo + caminho da imagem gerada. Se não houver tag, devolve igual.
async function resolvePhotoTag(reply: string): Promise<{ content: string; imageUrl?: string }> {
  const match = reply.match(/\[\[FOTO: ([\s\S]*?)\]\]/);
  if (!match) {
    return { content: reply };
  }

  const scene = match[1].trim();
  const content = reply.replace(match[0], "").trim();

  try {
    const url = await generateImage(scene);
    return { content, imageUrl: url };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Falha ao gerar foto:", detail);
    return { content };
  }
}

// Aplica um pequeno "drift" emocional após cada troca de mensagem, imitando
// como um evento na conversa mexe no humor. O sinal vem do texto trocado.
function applyMoodDrift(userMessage: string, assistantReply: string): void {
  const lower = (userMessage + " " + assistantReply).toLowerCase();

  const change: Partial<Record<"alegria" | "tristeza" | "animo" | "energia" | "ousadia" | "safadeza", number>> =
    {};

  if (/kkk|kk|haha|risos|que graça|achei bom|adoro|amo/.test(lower)) change.alegria = 6;
  if (/triste|mal|chatead|desabafo|to mal|cansei/.test(lower)) change.tristeza = 5;
  if (/elogio|gostosa|linda|bonita|princesa|adoro você|amo você/.test(lower)) change.animo = 5;
  if (/foto|sexy|lingerie|tesao|tesão|quero você|me excita|desejo/.test(lower)) change.safadeza = 8;
  if (/brava|raiva|odeio|irrit|fica quieto|cala boca/.test(lower)) change.tristeza = 3;
  if (/vamos sair|rolê|festa|bora|animada/.test(lower)) change.energia = 6;

  applyEmotionChange(change);
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
    const { content, imageUrl } = await resolvePhotoTag(reply);
    addMessage(DEFAULT_CONVERSATION_ID, "assistant", content, imageUrl);
    applyMoodDrift(message, content);
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
