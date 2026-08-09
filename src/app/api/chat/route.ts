import { NextResponse } from "next/server";
import { generateReply, generateWakeReply, updateLearningFromHistory, type HistoryMessage, type Provider } from "@/lib/ai";
import { generateImage } from "@/lib/image";
import { applyEmotionChange, getEmotionalState } from "@/lib/state";
import { pickResolvedMedia } from "@/lib/photoSource";
import { extractPhotoRequest } from "@/lib/photos";
import { splitIntoBubbles } from "@/lib/bubbles";
import { getMessages, addMessage, resetConversation, countMessages } from "@/lib/history";
import { bumpMemoryStats, getChatMemory, rememberPhotoSent } from "@/lib/memory";
import { extractEntregarTag, addRecado, isCasadaComEsteChat, isPicanteScene } from "@/lib/recados";
import { isAwake, parseWakeCommand, buildWakeStatus } from "@/lib/wake";

export const runtime = "nodejs";

// Conversa do site: uma única chave persistente no Postgres. A Pollianne lembra
// do histórico mesmo com cold start/deploy (não some mais como no Map antigo).
const CHAT_KEY = "web";

// Detecta pedido de foto na resposta (tag [[FOTO: ...]] completa, cortada ou o
// literal "[foto]") e anexa uma foto da Pollianne: primeiro do Supabase (mídias
// enviadas pelo mestre), depois local (public/polli), e por fim Unsplash.
// Sem pedido de foto, devolve o texto igual. A foto só sai se houver intimidade
// suficiente (nivel da memória) — ela não manda foto pra qualquer um.
async function resolvePhotoTag(
  reply: string,
  userMessage?: string
): Promise<{ content: string; imageUrl?: string; description?: string }> {
  const req = extractPhotoRequest(reply, userMessage);
  if (!req) {
    return { content: reply };
  }

  const { content, scene } = req;

  // Gate do relacionamento: se a Polli está namorando OUTRA pessoa, foto
  // ousada não sai pra quem não é o par dela — devolve só o texto.
  if (!(await isCasadaComEsteChat(CHAT_KEY)) && isPicanteScene(scene)) {
    return { content };
  }

  try {
    // Progresso: quanto mais mensagens, mais "calor" na curva (secundário).
    const totalMessages = await countMessages(CHAT_KEY);
    const progress = Math.min(totalMessages / 20, 1);
    const state = getEmotionalState();

    // Nível de intimidade da memória: é ELE (junto do calor) que libera a foto.
    const intimacy = (await getChatMemory(CHAT_KEY)).sobre_o_usuario.nivel ?? 0;

    const result = await pickResolvedMedia(
      scene,
      state.emotions.safadeza,
      progress,
      { enableUnsplash: true, intimacy }
    );

    // Quando sai a foto, a description vem junto pra Polli "saber o que é".
    if (result?.publicUrl) {
      return { content, imageUrl: result.publicUrl, description: result.description };
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
// Protegido: exige a senha de admin no header x-reset-code.
export async function DELETE(request: Request): Promise<NextResponse> {
  const resetCode = process.env.RESET_CODE ?? "ballerini";
  const code = request.headers.get("x-reset-code") ?? "";
  if (code !== resetCode) {
    return NextResponse.json({ error: "Senha de reset incorreta." }, { status: 403 });
  }
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

  // MODO FÁBRICA: acordar/dormir, e conversa acordada roda no prompt honesto.
  const wake = parseWakeCommand(message, CHAT_KEY);
  if (wake.handled) {
    // Mantém no histórico pra não quebrar a sequência.
    if (wake.reply) {
      const wakeBubbles = splitIntoBubbles(wake.reply);
      await addMessage(CHAT_KEY, "user", message);
      await addMessage(CHAT_KEY, "assistant", wake.reply, undefined, wakeBubbles);
      return NextResponse.json({ messages: await getMessages(CHAT_KEY) });
    }
    const status = await buildWakeStatus(CHAT_KEY, provider);
    const statusBubbles = splitIntoBubbles(status);
    await addMessage(CHAT_KEY, "user", message);
    await addMessage(CHAT_KEY, "assistant", status, undefined, statusBubbles);
    return NextResponse.json({ messages: await getMessages(CHAT_KEY) });
  }

  if (isAwake(CHAT_KEY)) {
    await addMessage(CHAT_KEY, "user", message);
    const hist: HistoryMessage[] = (await getMessages(CHAT_KEY)).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    try {
      const reply = await generateWakeReply(hist, provider, CHAT_KEY);
      const bubbles = splitIntoBubbles(reply);
      await addMessage(CHAT_KEY, "assistant", reply, undefined, bubbles);
      return NextResponse.json({ messages: await getMessages(CHAT_KEY) });
    } catch (error) {
      console.error("Falha ao gerar resposta (modo fábrica):", error);
      return NextResponse.json(
        { error: "Falhei em modo fábrica por aqui. Tenta de novo.", messages: await getMessages(CHAT_KEY) },
        { status: 502 }
      );
    }
  }

  await addMessage(CHAT_KEY, "user", message);
  await bumpMemoryStats(CHAT_KEY, 1, 1);

  const history: HistoryMessage[] = (await getMessages(CHAT_KEY)).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const reply = await generateReply(history, provider, CHAT_KEY);

    // Recados: se a IA marcou a resposta com a tag [[ENTREGAR: ... | ...]],
    // o sistema limpa a tag do texto e grava o recado na memória global pra
    // entregar depois pra pessoa certa.
    const parsed = extractEntregarTag(reply);
    if (parsed.recado) {
      const deNome = (await getChatMemory(CHAT_KEY)).sobre_o_usuario.nome;
      await addRecado({
        para_nome: parsed.recado.para_nome,
        texto: parsed.recado.texto,
        de_nome: deNome ?? `alguém (chat ${CHAT_KEY})`,
      });
    }

    const { content, imageUrl, description } = await resolvePhotoTag(parsed.content, message);
    const bubbles = splitIntoBubbles(content);
    await addMessage(CHAT_KEY, "assistant", content, imageUrl, bubbles);
    await bumpMemoryStats(CHAT_KEY, 0, 1);
    if (imageUrl) await rememberPhotoSent(CHAT_KEY, description);
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
