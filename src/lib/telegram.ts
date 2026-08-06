import { readFileSync } from "node:fs";
import path from "node:path";
import { generateReply, updateLearningFromHistory, type HistoryMessage, type Provider } from "@/lib/ai";
import { generateImage } from "@/lib/image";
import { applyEmotionChange, getEmotionalState } from "@/lib/state";
import { pickLocalPhotoForScene, extractPhotoRequest } from "@/lib/photos";
import { splitIntoBubbles } from "@/lib/bubbles";

const TELEGRAM_API = "https://api.telegram.org";

// Delay ALEATÓRIO de 0 a 10 segundos entre o envio de cada balão — parece
// que a pessoa pensa e digita sem ritmo fixo (menos robótico).
function randomDelayMs(): number {
  return Math.floor(Math.random() * 10000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Token do bot lido do .env (TELEGRAM_BOT_TOKEN).
export function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

// Provedor padrão definido no ambiente (DEFAULT_PROVIDER) ou "openai".
function defaultProvider(): Provider {
  const p = (process.env.DEFAULT_PROVIDER ?? "openai").toLowerCase();
  return p === "deepseek" || p === "grok" ? p : "openai";
}

// Provedor escolhido, guardado por chat do Telegram.
const providerByChat = new Map<number, Provider>();

function getProvider(chatId: number): Provider {
  return providerByChat.get(chatId) ?? defaultProvider();
}

// Uma conversa por chat do Telegram (igual à conversa fixa do chat interno,
// mas com histórico separado por usuário do Telegram).
type StoredMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  bubbles?: string[];
  createdAt: string;
};

const memoryStore = new Map<number, StoredMessage[]>();

function getMessages(chatId: number): StoredMessage[] {
  if (!memoryStore.has(chatId)) {
    memoryStore.set(chatId, []);
  }
  return memoryStore.get(chatId)!;
}

function addMessage(
  chatId: number,
  role: "user" | "assistant",
  content: string,
  imageUrl?: string,
  bubbles?: string[]
): StoredMessage {
  const messages = getMessages(chatId);
  const message: StoredMessage = {
    id: messages.length + 1,
    role,
    content,
    imageUrl,
    bubbles,
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  return message;
}

// Chama um método da Bot API do Telegram.
async function callApi<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram ${method}: ${data.description ?? "erro desconhecido"}`);
  }
  return data.result;
}

// Envia mensagem de texto pro usuário.
export async function sendText(chatId: number, text: string): Promise<void> {
  await callApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  });
}

// Aciona o balão "digitando..." real do Telegram (typing) enquanto o bot
// "pensa" e envia os balões com delay. Deve ser chamado repetidamente.
export async function sendTyping(chatId: number): Promise<void> {
  try {
    await callApi("sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {
    // Se falhar, ignora — é só um indicador visual.
  }
}

// Envia foto (URL pública) com legenda.
export async function sendPhoto(chatId: number, photoUrl: string, caption: string): Promise<void> {
  await callApi("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "Markdown",
  });
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return mime[ext] ?? "application/octet-stream";
}

// Envia uma foto que está no DISCO (public/polli) via multipart — o Telegram
// não consegue baixar URLs locais, então o arquivo é subido junto.
export async function sendPhotoFile(chatId: number, filePath: string, caption: string): Promise<void> {
  const token = getBotToken();
  const buffer = readFileSync(filePath);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([buffer], { type: mimeFor(filePath) }), path.basename(filePath));
  form.append("caption", caption);
  form.append("parse_mode", "Markdown");

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram sendPhoto: ${data.description ?? "erro desconhecido"}`);
  }
}

// Registra a URL pública que o Telegram usará pra entregar os updates.
export async function setWebhook(url: string): Promise<unknown> {
  return callApi("setWebhook", { url });
}

// Remove o webhook (volta a usar long polling).
export async function deleteWebhook(): Promise<unknown> {
  return callApi("deleteWebhook", {});
}

export async function getWebhookInfo(): Promise<unknown> {
  return callApi("getWebhookInfo", {});
}

// Detecta pedido de foto na resposta (tag [[FOTO: ...]] completa, cortada ou o
// literal "[foto]") e devolve texto limpo + a foto LOCAL da Pollianne
// (public/polli). O Telegram recebe o caminho do arquivo no disco (enviado via
// multipart). Se as pastas estiverem vazias, tenta o Unsplash (URL pública).
async function resolvePhotoTag(
  chatId: number,
  reply: string,
  userMessage?: string
): Promise<{ content: string; imageUrl?: string; filePath?: string }> {
  const req = extractPhotoRequest(reply, userMessage);
  if (!req) {
    return { content: reply };
  }

  const { content, scene } = req;

  try {
    const totalMessages = getMessages(chatId).length;
    const progress = Math.min(totalMessages / 20, 1);
    const state = getEmotionalState();

    const photo = pickLocalPhotoForScene(scene, state.emotions.safadeza, progress);
    if (photo) {
      return { content, imageUrl: photo.publicUrl, filePath: photo.filePath };
    }

    // Fallback (pastas vazias): URL pública do Unsplash (o Telegram baixa direto).
    const url = await generateImage(scene || "retrato de mulher", { remote: true });
    return { content, imageUrl: url };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Falha ao gerar foto (Telegram):", detail);
    return { content };
  }
}

// Mesmo drift emocional do chat interno.
function applyMoodDrift(userMessage: string, assistantReply: string): void {
  const lower = (userMessage + " " + assistantReply).toLowerCase();

  const change: Partial<
    Record<"alegria" | "tristeza" | "animo" | "energia" | "ousadia" | "safadeza", number>
  > = {};

  if (/kkk|kk|haha|risos|que graça|achei bom|adoro|amo/.test(lower)) change.alegria = 6;
  if (/triste|mal|chatead|desabafo|to mal|cansei/.test(lower)) change.tristeza = 5;
  if (/elogio|gostosa|linda|bonita|princesa|adoro você|amo você/.test(lower)) change.animo = 5;
  if (/foto|sexy|lingerie|tesao|tesão|quero você|me excita|desejo/.test(lower)) change.safadeza = 8;
  if (/brava|raiva|odeio|irrit|fica quieto|cala boca/.test(lower)) change.tristeza = 3;
  if (/vamos sair|rolê|festa|bora|animada/.test(lower)) change.energia = 6;

  applyEmotionChange(change);
}

// Processa uma mensagem de texto: mesma lógica do chat interno.
async function processMessage(
  chatId: number,
  userMessage: string,
  provider: Provider
): Promise<void> {
  addMessage(chatId, "user", userMessage);

  const history: HistoryMessage[] = getMessages(chatId).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    await sendTyping(chatId); // "digitando..." enquanto a IA pensa e manda os balões
    const reply = await generateReply(history, provider);
    const { content, imageUrl, filePath } = await resolvePhotoTag(chatId, reply, userMessage);
    const bubbles = splitIntoBubbles(content);
    addMessage(chatId, "assistant", content, imageUrl, bubbles);
    applyMoodDrift(userMessage, content);
    // Personalidade flexível: reescreve o que aprendeu sobre este usuário.
    await updateLearningFromHistory(history, provider);

    // Foto (se houver) sempre vai com o primeiro balão; o resto vira mensagens
    // soltas, enviadas com um pequeno delay entre si pra não parecer robô.
    const [first, ...rest] = bubbles;
    if (filePath) {
      await sendPhotoFile(chatId, filePath, first ?? content);
    } else if (imageUrl) {
      await sendPhoto(chatId, imageUrl, first ?? content);
    } else {
      await sendText(chatId, first ?? content);
    }
    for (const bubble of rest) {
      await sleep(randomDelayMs());
      // Reaviva o "digitando..." do Telegram (dura ~5s) antes do próximo balão.
      await sendTyping(chatId);
      await sendText(chatId, bubble);
    }
  } catch (error) {
    console.error("Falha ao gerar resposta (Telegram):", error);
    await sendText(chatId, "Dá uma outra chance pra mim? Deixa eu tentar de novo... 😅");
  }
}

// Handler de um update (mensagem) recebido pelo webhook.
export async function handleTelegramUpdate(update: {
  message?: {
    chat?: { id?: number };
    text?: string;
    from?: { first_name?: string };
  };
}): Promise<boolean> {
  const message = update.message;
  if (!message?.chat?.id || typeof message.text !== "string") {
    return false; // ignorado (foto, comando não textual, etc.)
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Comandos básicos.
  if (text === "/start") {
    await sendText(
      chatId,
      "Oi, amor! 🥰 Tô aqui agora. Pode falar comigo que eu respondo na hora. 😘"
    );
    return true;
  }

  if (text === "/reset") {
    memoryStore.set(chatId, []);
    await sendText(chatId, "Recomeçando do zero, bb... tô pronta de novo. 🥺");
    return true;
  }

  if (text === "/estado") {
    const { getEmotionalState, TEMPERAMENT_INFO } = await import("@/lib/state");
    const s = getEmotionalState();
    const info = TEMPERAMENT_INFO[s.temperament];
    await sendText(
      chatId,
      `Hoje eu tô *${info.label}*.\n${info.how}\nAlegria ${s.emotions.alegria} · Animo ${s.emotions.animo} · Energia ${s.emotions.energia} · Ousadia ${s.emotions.ousadia} · Safadeza ${s.emotions.safadeza}`
    );
    return true;
  }

  if (text.startsWith("/api")) {
    const arg = text.replace("/api", "").trim().toLowerCase();

    if (arg === "openai" || arg === "deepseek" || arg === "grok") {
      providerByChat.set(chatId, arg);
      await sendText(
        chatId,
        `Motor trocado pra *${arg}*. A partir de agora eu tô usando ele. 😉`
      );
      return true;
    }

    if (arg === "") {
      const atual = getProvider(chatId);
      await sendText(
        chatId,
        `Motor atual: *${atual}*\n\nPra trocar, manda:\n/api openai — natural e moderada\n/api deepseek — sem travas, mais picante\n/api grok — inteligente e picante`
      );
      return true;
    }

    await sendText(
      chatId,
      "Motor desconhecido. Válidos: `openai`, `deepseek` ou `grok`. Ex.: `/api deepseek`"
    );
    return true;
  }

  await processMessage(chatId, text, getProvider(chatId));
  return true;
}
