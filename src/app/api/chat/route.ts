import { NextResponse } from "next/server";
import { generateReply, updateLearningFromHistory, type HistoryMessage, type Provider } from "@/lib/ai";
import { generateImage } from "@/lib/image";
import { applyEmotionChange, getEmotionalState } from "@/lib/state";
import { pickResolvedMedia } from "@/lib/photoSource";
import { extractPhotoRequest } from "@/lib/photos";
import { splitIntoBubbles } from "@/lib/bubbles";
import { getMessages, addMessage, resetConversation, countMessages } from "@/lib/history";

export const runtime = "nodejs";

// Conversa do site: uma única chave persistente no Postgres. A Pollianne lembra
// do histórico mesmo com cold start/deploy (não some mais como no Map antigo).
const CHAT_KEY = "web";

// Detecta pedido de foto na resposta (tag [[FOTO: ...]] completa, cortada ou o
// literal "[foto]") e anexa uma foto da Pollianne: primeiro do Supabase (mídias
// enviadas pelo mestre), depois local (public/polli), e por fim Unsplash.
// Sem pedido de foto, devolve o texto igual.
async function resolvePhotoTag(
  reply: string,
  userMessage?: string
): Promise<{ content: string; imageUrl?: string }> {
  const req = extractPhotoRequest(reply, userMessage);
  if (!req) {
    return { content: reply };
  }

  const { content, scene } = req;

  try {
    // Progresso: quanto mais mensagens, mais "calor" libera fotos picantes.
    const totalMessages = await countMessages(CHAT_KEY);
    const progress = Math.min(totalMessages / 20, 1);
    const state = getEmotionalState();

    const result = await pickResolvedMedia(
      scene,
      state.emotions.safadeza,
      progress,
      { enableUnsplash: true }
    );

    if (result?.publicUrl) {
      return { content, imageUrl: result.publicUrl };
    }

    // Fallback final (nada local): foto parecida via Unsplash.
    if (result?.remote) {
      const url = await generateImage(scene || "retrato de mulher");
      return { content, imageUrl: url };
    }

    return { content };
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
  return NextResponse.json({ messages: await getMessages(CHAT_KEY) });
}

// Reset: zera o histórico da conversa — o bot volta à estaca zero, sem memória.
export async function DELETE(): Promise<NextResponse> {
  await resetConversation(CHAT_KEY);
  return NextResponse.json({
    ok: true,
    messages: await getMessages(CHAT_KEY),
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

  await addMessage(CHAT_KEY, "user", message);

  const history: HistoryMessage[] = (await getMessages(CHAT_KEY)).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const reply = await generateReply(history, provider, CHAT_KEY);
    const { content, imageUrl } = await resolvePhotoTag(reply, message);
    const bubbles = splitIntoBubbles(content);
    await addMessage(CHAT_KEY, "assistant", content, imageUrl, bubbles);
    applyMoodDrift(message, content);
    // Personalidade flexível: a Pollianne reescreve o que aprendeu sobre a pessoa.
    await updateLearningFromHistory(history, provider, CHAT_KEY);
  } catch (error) {
    console.error("Falha ao gerar resposta da IA:", error);
    return NextResponse.json(
      {
        error: "Não consegui responder agora. Tente novamente em instantes.",
        messages: await getMessages(CHAT_KEY),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ messages: await getMessages(CHAT_KEY) });
}
