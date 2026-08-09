import { readFileSync } from "node:fs";
import path from "node:path";
import { generateReply, generateWakeReply, updateLearningFromHistory, refineReplyWithPhoto, type HistoryMessage, type Provider } from "@/lib/ai";
import { generateImage } from "@/lib/image";
import { applyEmotionChange, getEmotionalState } from "@/lib/state";
import { pickResolvedMedia } from "@/lib/photoSource";
import { extractPhotoRequest } from "@/lib/photos";
import { splitIntoBubbles } from "@/lib/bubbles";
import {
  getMessages as dbGetMessages,
  addMessage as dbAddMessage,
  resetConversation,
} from "@/lib/history";
import { bumpMemoryStats, getChatMemory, rememberPhotoSent } from "@/lib/memory";
import { extractEntregarTag, addRecado, isCasadaComEsteChat, isPicanteScene } from "@/lib/recados";
import {
  isAwake,
  parseWakeCommand,
  buildWakeStatus,
} from "@/lib/wake";
import {
  funnelEnabled,
  getFunnelStep,
  advanceFunnelStep,
  funnelPhotoForStep,
  funnelPhotoLine,
  buildPaymentPayload,
} from "@/lib/funnel";
import {
  isSimulationMode,
  enableSimulation,
  handleSimulatedPayment,
  isPaymentProof,
  isNewContentRequest,
  handleNewContentRequest,
} from "@/lib/simulate";

const TELEGRAM_API = "https://api.telegram.org";

// Mensagens de boas-vindas (/start): todas fazem a MESMA introdução (nome,
// idade, pergunta pelo nome), só com jeitos de falar diferentes — sorteia uma
// aleatória a cada /start pra não parecer mensagem decorada.
const START_MESSAGES: string[] = [
  "Ola, Meu  nome é Polianne, tenho 21 anos e você, como se chama?",
  "Oie, eu sou a Polianne, tenho 21 anos. E você, me conta seu nome?",
  "Oi! Me chamo Polianne, tenho 21 anos. E o seu nome, qual é?",
  "Oii, prazer! Sou a Polianne, 21 anos. Como você se chama?",
  "Oi! Eu sou a Polli, tenho 21 aninhos. E você, qual seu nome?",
  "Olaa! Meu nome é Polianne, tenho 21 anos. E você, como te chamam?",
  "Oi, tudo bem? Sou a Polianne, tenho 21 anos. Qual é o seu nome?",
  "Oiii, me chamo Polianne, tenho 21 anos. E aí, como você se chama?",
  "Oi! Sou a Polianne, 21 anos. Me fala seu nome, quero saber com quem tô falando.",
  "Ola, meu nome é Polianne, tenho 21 anos 😊 e você? Qual é seu nome?",
  "Oiee! Polianne aqui, 21 anos. E você, como se chama?",
  "Oi, oi! Eu sou a Polianne, tenho 21 anos. Quem eu tô falando com você?",
  "Ola! Prazer, sou Polianne, 21 anos. E você, me conta o seu nome?",
  "Oi! Meu nome é Polianne, tenho 21 anos. Qual é o seu nome, moço(a)?",
  "Oiii, eu sou a Polianne, de 21 anos. E aí, qual seu nome?",
  "Oi! Tô aqui a Polianne, 21 anos. E você, como te chamo?",
  "Ola! Sou a Polli, tenho 21 anos. E você, primeiro: qual é seu nome?",
  "Oiii! Me chamo Polianne, tenho 21 anos. Me diz, qual é o seu nome?",
  "Oi! A Polianne aqui, 21 anos. E você, como se chama? Quero saber!",
  "Ola, tudo certo? Sou Polianne, tenho 21 anos. E você, qual é o seu nome?",
];

// Sorteia uma mensagem de boas-vindas aleatória (0..n-1).
function pickStartMessage(): string {
  return START_MESSAGES[Math.floor(Math.random() * START_MESSAGES.length)];
}

// Delay curto e aleatório entre os balões — ritmo humano de pensamento, mas
// SEM fazer a resposta demorar demais. A demora de ~1 minuto não era esse
// delay: era a chamada extra de IA (aprendizado) rodando ANTES do envio.
function randomDelayMs(): number {
  return Math.floor(700 + Math.random() * 1200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Caption da foto: só o texto de resposta da Polli, limitado ao máximo do
// Telegram. A descrição NÃO é anexada — a IA já a transformou em fala natural
// (sr ex.: "o que achou da minha blusinha preta?").
function photoCaption(text: string, _description?: string): string {
  const limit = 1024 * 4; // limite do Telegram por caption
  return text.length > limit ? text.slice(0, limit) : text;
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

// Deduplicação de updates: o Telegram pode reentregar o MESMO update_id (retries
// de rede, timeout do webhook, deploy no meio do processamento). Guardamos os
// últimos processados pra não responder/enviar duplicado.
const PROCESSED_TTL_MS = 10 * 60 * 1000; // 10 min (janela de retry do Telegram)
const processedUpdates = new Map<number, number>(); // update_id -> timestamp

function isDuplicateUpdate(update: { update_id?: number }): boolean {
  const id = update.update_id;
  if (typeof id !== "number") return false;
  const now = Date.now();

  if (processedUpdates.has(id)) {
    return true; // já vimos esse update → ignora silenciosamente
  }

  processedUpdates.set(id, now);
  // Limpeza: remove entradas velhas pra não crescer sem limite.
  if (processedUpdates.size > 200) {
    for (const [key, ts] of processedUpdates) {
      if (now - ts > PROCESSED_TTL_MS) processedUpdates.delete(key);
    }
  }
  return false;
}

function getProvider(chatId: number): Provider {
  return providerByChat.get(chatId) ?? defaultProvider();
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

// Mantém o "digitando..." do Telegram ATIVO enquanto uma tarefa assíncrona
// demora (geração da IA, delay entre balões). O indicador do Telegram morre
// sozinho em ~5s, então reenviamos a cada ~4s. Retorna uma função pra parar.
// Importante: chama `stop()` EXATAMENTE antes de enviar a mensagem — aí o
// "digitando" some no mesmo instante em que a mensagem chega (chat normal).
function keepTyping(chatId: number): { stop: () => void } {
  let stopped = false;
  sendTyping(chatId); // acorda já
  const timer = setInterval(() => {
    if (!stopped) sendTyping(chatId);
  }, 4000);
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
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

// Envia foto que está no DISCO (public/polli) via multipart — o Telegram
// não consegue baixar URLs locais, então o arquivo é subido junto.
export async function sendPhotoFile(chatId: number, filePath: string, caption: string): Promise<void> {
  const buffer = readFileSync(filePath);
  await sendPhotoBytes(chatId, buffer, mimeFor(filePath), path.basename(filePath), caption);
}

// Envia o QR do Pix direto do base64 (sem depender de arquivo em disco — no
// filesystem efêmero da Vercel o PNG gravado em public/ não persiste).
export async function sendPhotoBase64(chatId: number, base64: string, caption: string): Promise<void> {
  await sendPhotoBytes(
    chatId,
    Buffer.from(base64, "base64"),
    "image/png",
    "qrcode.png",
    caption
  );
}

// Núcleo do envio de foto via multipart (bytes brutos, qualquer origem).
async function sendPhotoBytes(
  chatId: number,
  buffer: Buffer,
  mime: string,
  filename: string,
  caption: string
): Promise<void> {
  const token = getBotToken();
  const form = new FormData();
  form.append("chat_id", String(chatId));
  // Uint8Array é um BlobPart válido; Buffer não (no DOM FormData).
  form.append("photo", new Blob([new Uint8Array(buffer)], { type: mime }), filename);
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
// literal "[foto]") e devolve texto limpo + a foto da Pollianne (Supabase ou
// local, com Unsplash de fallback). Prefere enviar o caminho do arquivo local
// via multipart quando vem do disco; se vier do Supabase, manda a URL pública
// (o Telegram baixa direto). A foto só sai com intimidade suficiente: sem
// química a Polli não manda foto pra qualquer um.
async function resolvePhotoTag(
  chatId: number,
  reply: string,
  userMessage?: string
): Promise<{ content: string; imageUrl?: string; filePath?: string; description?: string }> {
  const req = extractPhotoRequest(reply, userMessage);
  if (!req) {
    return { content: reply };
  }

  const { content, scene } = req;

  // Gate do relacionamento: se a Polli está namorando OUTRA pessoa, foto
  // ousada não sai pra quem não é o par dela — devolve só o texto.
  if (!(await isCasadaComEsteChat(String(chatId))) && isPicanteScene(scene)) {
    return { content };
  }

  try {
    const history = await dbGetMessages(String(chatId));
    const totalMessages = history.length;
    const progress = Math.min(totalMessages / 20, 1);
    const state = getEmotionalState();

    // Nível de intimidade da memória é o que libera a foto.
    const intimacy = (await getChatMemory(String(chatId))).sobre_o_usuario.nivel ?? 0;

    const result = await pickResolvedMedia(
      scene,
      state.emotions.safadeza,
      progress,
      { enableUnsplash: true, intimacy }
    );

    // Foto do Supabase → URL pública. Foto LOCAL → devolve o filePath (o arquivo
    // real do disco) usado no sendPhotoFile. A description volta pra a Polli
    // saber o que está enviando.
    if (result?.filePath) {
      return { content, filePath: result.filePath, description: result.description };
    }
    if (result?.publicUrl) {
      return { content, imageUrl: result.publicUrl, description: result.description };
    }

    // Fallback (nada local): URL pública do Unsplash (o Telegram baixa direto).
    if (result?.remote) {
      const url = await generateImage(scene || "retrato de mulher", { remote: true });
      return { content, imageUrl: url };
    }

    return { content };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Falha ao gerar foto (Telegram):", detail);
    return { content };
  }
}

// Foto forçada do FUNIL de vendas: ignora curva/intimidade e usa a tag exata
// (normal -> medium -> hot). Devolve filePath (foto local, multipart) ou URL.
async function resolveTelegramFunnelPhoto(
  tag: "normal" | "medium" | "hot_medium" | "hot"
): Promise<{ imageUrl?: string; filePath?: string; description?: string }> {
  try {
    const state = getEmotionalState();
    const result = await pickResolvedMedia("", state.emotions.safadeza, 1, {
      enableUnsplash: true,
      forceTag: tag,
    });
    if (result?.filePath) {
      return { filePath: result.filePath, description: result.description };
    }
    if (result?.publicUrl) {
      return { imageUrl: result.publicUrl, description: result.description };
    }
    if (result?.remote) {
      const url = await generateImage("retrato de mulher", { remote: true });
      return { imageUrl: url };
    }
    return {};
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Falha ao gerar foto do funil (Telegram):", detail);
    return {};
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
  const chatKey = String(chatId);
  await dbAddMessage(chatKey, "user", userMessage);
  await bumpMemoryStats(chatKey, 1, 1);

  const history: HistoryMessage[] = (await dbGetMessages(chatKey)).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const typing = keepTyping(chatId);

    // MODO FUNIL (vendas): o sistema conduz o roteiro — força a foto da etapa
    // e avança. A IA só dá naturalidade (prompt simplificado no ai.ts).
    if (funnelEnabled()) {
      const step = await getFunnelStep(chatKey);
      const photoTag = funnelPhotoForStep(step);
      const reply = await generateReply(history, provider, chatKey);

      const photo = photoTag
        ? await resolveTelegramFunnelPhoto(photoTag)
        : { filePath: undefined as string | undefined, imageUrl: undefined as string | undefined, description: undefined as string | undefined };

      let finalContent = reply;
      if (photo.imageUrl && photoTag && photo.description) {
        // Foto picante + moderação = a IA foge de falar da foto. Fala
        // padronizada (sem IA) citando a peça/pose da descrição real.
        finalContent = funnelPhotoLine(photoTag, photo.description);
      } else if (photo.description) {
        finalContent = await refineReplyWithPhoto(reply, photo.description, provider);
      }

      // Etapa 4: gera o PIX real (QR + copia-e-cola). O QR preferencialmente
      // sai direto do base64 (sem disco); só cai no filePath se não houver.
      let qrBase64: string | undefined;
      let qrFilePath: string | undefined;
      let pixBubble: string | undefined;
      if (step === 4) {
        const pay = await buildPaymentPayload(chatKey);
        // A fala da IA e o bloco de pagamento vão separados: a chave Pix tem
        // pontos e o splitIntoBubbles cortaria no meio.
        const linhas = (pay.text ?? "").split("\n");
        const idxCopia = linhas.findIndex((l) => /copia e cola/i.test(l));
        pixBubble = idxCopia >= 0 ? linhas.slice(idxCopia).join("\n").trim() : pay.text;
        qrBase64 = pay.qrBase64;
        qrFilePath = pay.filePath;
      }

      const bubbles = splitIntoBubbles(finalContent);
      // Na etapa 4 a foto seguida é vazia; o QR vai na msg de pagamento abaixo.
      await dbAddMessage(chatKey, "assistant", finalContent, step === 4 ? undefined : photo.imageUrl, bubbles);
      if (photo.description) await rememberPhotoSent(chatKey, photo.description);

      const [first, ...rest] = bubbles;
      typing.stop();
      if (qrBase64 || qrFilePath) {
        // Foto do QR + caption com a FALA da IA. O QR em base64 é preferido
        // (funciona no filesystem efêmero); o filePath é o fallback local.
        if (qrBase64) {
          await sendPhotoBase64(chatId, qrBase64, photoCaption(first ?? finalContent));
        } else {
          await sendPhotoFile(chatId, qrFilePath!, photoCaption(first ?? finalContent));
        }
        for (const bubble of rest) {
          const wait = keepTyping(chatId);
          await sleep(randomDelayMs());
          wait.stop();
          await sendText(chatId, bubble);
        }
        // Bloco do PIX em UMA mensagem de texto única (chave inteira).
        if (pixBubble) {
          const wait = keepTyping(chatId);
          await sleep(randomDelayMs());
          wait.stop();
          await sendText(chatId, pixBubble);
          await dbAddMessage(chatKey, "assistant", pixBubble, undefined, [pixBubble]);
        }
      } else if (photo.filePath) {
        await sendPhotoFile(chatId, photo.filePath, photoCaption(first ?? finalContent));
        for (const bubble of rest) {
          const wait = keepTyping(chatId);
          await sleep(randomDelayMs());
          wait.stop();
          await sendText(chatId, bubble);
        }
      } else if (photo.imageUrl) {
        await sendPhoto(chatId, photo.imageUrl, photoCaption(first ?? finalContent));
        for (const bubble of rest) {
          const wait = keepTyping(chatId);
          await sleep(randomDelayMs());
          wait.stop();
          await sendText(chatId, bubble);
        }
      } else {
        await sendText(chatId, first ?? finalContent);
        for (const bubble of rest) {
          const wait = keepTyping(chatId);
          await sleep(randomDelayMs());
          wait.stop();
          await sendText(chatId, bubble);
        }
      }
      await advanceFunnelStep(chatKey, step);
      return;
    }

    // Mantém o "digitando..." vivo enquanto a IA gera a resposta (o indicador
    // do Telegram morre em ~5s, então reenviamos a cada 4s).
    const reply = await generateReply(history, provider, chatKey);

    // Recados: se a IA marcou a resposta com a tag [[ENTREGAR: ... | ...]],
    // o sistema limpa a tag do texto e grava o recado na memória global pra
    // entregar depois pra pessoa certa.
    const parsed = extractEntregarTag(reply);
    if (parsed.recado) {
      const deNome = (await getChatMemory(chatKey)).sobre_o_usuario.nome;
      await addRecado({
        para_nome: parsed.recado.para_nome,
        texto: parsed.recado.texto,
        de_nome: deNome ?? `alguém (chat ${chatKey})`,
      });
    }

    const { content, imageUrl, filePath, description } = await resolvePhotoTag(chatId, parsed.content, userMessage);
    // O bot SABE o que está enviando: com a descrição real da foto escolhida,
    // reescreve a resposta pra falar DESTA foto (não de uma foto qualquer).
    const finalContent =
      (imageUrl || filePath) && description
        ? await refineReplyWithPhoto(content, description, provider)
        : content;
    const bubbles = splitIntoBubbles(finalContent);
    await dbAddMessage(chatKey, "assistant", finalContent, imageUrl, bubbles);
    await bumpMemoryStats(chatKey, 0, 1);
    if (imageUrl || filePath) await rememberPhotoSent(chatKey, description);
    applyMoodDrift(userMessage, finalContent);

    // Envia os balões. Desligamos o typing ANTES de cada envio, para o
    // "digitando..." sumir no mesmo instante em que a mensagem "chega" —
    // fluxo de chat normal (sem mensagem sumindo nem 3 de uma vez).
    const [first, ...rest] = bubbles;
    typing.stop(); // digitando para antes da 1ª mensagem
    const caption = first ?? finalContent;
    if (filePath) {
      await sendPhotoFile(chatId, filePath, photoCaption(caption, description));
    } else if (imageUrl) {
      await sendPhoto(chatId, imageUrl, photoCaption(caption, description));
    } else {
      await sendText(chatId, caption);
    }
    for (const bubble of rest) {
      // "pensa" um pouco e relança o digitando até o próximo balão.
      const wait = keepTyping(chatId);
      await sleep(randomDelayMs());
      wait.stop(); // digitando some, a mensagem chega na sequência
      await sendText(chatId, bubble);
    }

    // Aprendizado flexível DEPOIS de mandar as mensagens. Antes ele rodava uma
    // chamada extra de IA (produceLearning) ANTES do envio, esticando a
    // resposta em ~1 minuto. Agora roda em background, sem travar o usuário.
    void updateLearningFromHistory(history, provider, chatKey);
  } catch (error) {
    console.error("Falha ao gerar resposta (Telegram):", error);
    await sendText(chatId, "Dá uma outra chance pra mim? Deixa eu tentar de novo... 😅");
  }
}

// Modo fábrica: processo como o processMessage normal, mas cada resposta roda
// no prompt honesto (buildWakeSystemPrompt). Salva no banco igual, para o
// histórico continuar contínuo.
async function processWakeMessage(
  chatId: number,
  userMessage: string,
  provider: Provider
): Promise<void> {
  const chatKey = String(chatId);
  await dbAddMessage(chatKey, "user", userMessage);
  await bumpMemoryStats(chatKey, 1, 1);

  const history: HistoryMessage[] = (await dbGetMessages(chatKey)).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const typing = keepTyping(chatId);
    const reply = await generateWakeReply(history, provider, chatKey);
    const bubbles = splitIntoBubbles(reply);
    await dbAddMessage(chatKey, "assistant", reply, undefined, bubbles);
    await bumpMemoryStats(chatKey, 0, 1);

    const [first, ...rest] = bubbles;
    typing.stop();
    await sendText(chatId, first ?? reply);
    for (const bubble of rest) {
      const wait = keepTyping(chatId);
      await sleep(randomDelayMs());
      wait.stop();
      await sendText(chatId, bubble);
    }
  } catch (error) {
    console.error("Falha ao gerar resposta (modo fábrica):", error);
    await sendText(chatId, "Falhei em modo fábrica por aqui, me dá um instante. 🤖");
  }
}

// Handler de um update (mensagem) recebido pelo webhook.
export async function handleTelegramUpdate(update: {
  update_id?: number;
  message?: {
    chat?: { id?: number };
    text?: string;
    from?: { first_name?: string };
  };
}): Promise<boolean> {
  // Se o Telegram reentregou um update que já processamos, ignora (anti-duplicado).
  if (isDuplicateUpdate(update)) {
    return false;
  }

  const message = update.message;
  if (!message?.chat?.id || typeof message.text !== "string") {
    return false; // ignorado (foto, comando não textual, etc.)
  }

  const chatId = message.chat.id;
  const text = message.text.trim();
  const chatKey = String(chatId);

  // MODO FÁBRICA: se a mensagem ACORDA o bot, trata aqui (sem chamar a IA).
  const wake = parseWakeCommand(text, chatKey);
  if (wake.handled) {
    if (wake.reply) {
      await sendText(chatId, wake.reply);
    } else {
      // Acordou: mostra o relatório do sistema.
      await sendText(chatId, await buildWakeStatus(chatKey, getProvider(chatId)));
    }
    return true;
  }

  // Se já está acordada, toda conversa roda em modo fábrica (honestidade total).
  if (isAwake(chatKey)) {
    await processWakeMessage(chatId, text, getProvider(chatId));
    return true;
  }

  // Assinante (pago ou simulado) perguntando se tem conteúdo novo: entrega o que
// saiu. Sem acesso ativo, cai na resposta normal da IA.
  if (isNewContentRequest(text)) {
    const r = await handleNewContentRequest(chatKey);
    if (!r.ok) {
      // Não tem acesso ativo — deixa a IA responder naturalmente (funil etc).
      // Nada a interceptar aqui.
    } else if (r.temNovidade) {
      await sendText(chatId, "Trouxe as novidades pra você! 💖 Segue. 😘");
      return true;
    } else {
      await sendText(
        chatId,
        "Por enquanto não saiu nada novo, bb. 💕 Mas se eu postar, você vai ser a primeira a saber!"
      );
      return true;
    }
  }

// Comprovante em modo simulação: se ativo, o bot se comporta como se o
  // pagamento tivesse sido confirmado e libera TODAS as fotos em massa.
  if (isPaymentProof(text) && (await isSimulationMode(chatKey))) {
    const mem = await getChatMemory(chatKey);
    const nome = (
      mem.sobre_o_usuario as unknown as { nome?: string }
    ).nome;
    const r = await handleSimulatedPayment(chatKey, nome);
    const info =
      r.total === 0
        ? "Hmm, não achei nenhuma foto pra te mandar ainda. 😅"
        : `Liberei ${r.entregues} pra você! 💖 (simulação de pagamento concluída)`;
    await sendText(chatId, info);
    return true;
  }

  // Comandos básicos.
  if (text === "/start") {
    // No modo funil o /start JÁ inicia o roteiro: a Polli se apresenta e manda
    // a amostra leve como primeiro contato (etapa 0).
    if (funnelEnabled()) {
      await processMessage(chatId, text, getProvider(chatId));
      return true;
    }
    await sendText(chatId, pickStartMessage());
    return true;
  }

  if (text.startsWith("/reset")) {
    // Reset é protegido: só quem sabe a senha apaga a memória da pessoa.
    const resetCode = process.env.RESET_CODE ?? "ballerini";
    const arg = text.replace("/reset", "").trim();
    if (!arg) {
      await sendText(
        chatId,
        "O reset apaga TODA a nossa memória. Me manda a senha: `/reset <senha>` 🔐"
      );
      return true;
    }
    if (arg !== resetCode) {
      await sendText(chatId, "Senha incorreta, bb. 😅 Essa eu não posso apagar.");
      return true;
    }
    await resetConversation(String(chatId));
    await sendText(chatId, "Recomeçando do zero, bb... apaguei tudo da minha memória. 🥺");
    return true;
  }

  if (text.startsWith("/simulator")) {
    const arg = text.replace("/simulator", "").trim();
    if (!arg) {
      await sendText(
        chatId,
        "Pra ativar o modo simulação de pagamento: `/simulator <senha>` 🔐\n\nDepois manda `[foto-comprovante]` que eu libero todo o conteúdo meu pra você (simulado)."
      );
      return true;
    }
    const r = await enableSimulation(chatKey, arg);
    if (!r.ok) {
      await sendText(chatId, r.reason ?? "Não consegui ativar a simulação. 😅");
      return true;
    }
    await sendText(
      chatId,
      "Modo simulação ATIVADO! 🔐 Estamos começando do zero por aqui.\n\nConversa comigo normal — quando você quiser saber o que é pagamento, é só mandar `[foto-comprovante]` e eu libero TUDO na hora. 😘"
    );
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
