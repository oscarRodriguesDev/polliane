/**
 * Persistência da conversa e da memória de longo prazo no Postgres (Supabase).
 *
 * Substitui o antigo `Map` em memória (que ZERAVA no Vercel a cada requisição
 * que caía em instância nova). Agora o histórico fica no banco: a Pollianne
 * lembra da conversa inteira e do que aprendeu sobre a pessoa, mesmo com
 * cold starts e deploy.
 *
 * Cada chat tem uma `chatKey`: "web" pro site, "<id do chat do Telegram>" pra
 * conversa no Telegram. Tudo é indexado por essa chave.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type StoredMessage = {
  id: number;
  chatKey: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  bubbles?: string[];
  createdAt: string;
};

const MAX_HISTORY = 200; // cap de segurança pra não estourar o contexto.

// Lê as mensagens de uma conversa (mais antiga → mais nova).
export async function getMessages(chatKey: string): Promise<StoredMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { chatKey },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    chatKey: r.chatKey,
    role: r.role as "user" | "assistant",
    content: r.content,
    ...(r.imageUrl ? { imageUrl: r.imageUrl } : {}),
    ...(r.bubbles ? { bubbles: r.bubbles as unknown as string[] } : {}),
    createdAt: r.createdAt.toISOString(),
  }));
}

// Adiciona uma mensagem e devolve a mensagem persistida.
export async function addMessage(
  chatKey: string,
  role: "user" | "assistant",
  content: string,
  imageUrl?: string,
  bubbles?: string[]
): Promise<StoredMessage> {
  const created = await prisma.chatMessage.create({
    data: {
      chatKey,
      role,
      content,
      ...(imageUrl ? { imageUrl } : {}),
      ...(bubbles ? { bubbles: bubbles as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  return {
    id: created.id,
    chatKey: created.chatKey,
    role: created.role as "user" | "assistant",
    content: created.content,
    ...(created.imageUrl ? { imageUrl: created.imageUrl } : {}),
    ...(created.bubbles ? { bubbles: created.bubbles as unknown as string[] } : {}),
    createdAt: created.createdAt.toISOString(),
  };
}

// Apaga o histórico de uma conversa (reset / "/reset"). A memória de longo
// prazo (ProfileMemory) também é apagada — estaca zero.
export async function resetConversation(chatKey: string): Promise<void> {
  await prisma.chatMessage.deleteMany({ where: { chatKey } });
  await prisma.profileMemory.delete({ where: { chatKey } }).catch(() => {});
}

// Número de mensagens da conversa (para progressão de fotos/calor).
export async function countMessages(chatKey: string): Promise<number> {
  return prisma.chatMessage.count({ where: { chatKey } });
}

// ---------- Memória de longo prazo (aprendizado sobre o usuário) ----------

// Lê o que a Pollianne aprendeu sobre a pessoa desta conversa.
export async function getProfileMemory(chatKey: string): Promise<string | null> {
  const mem = await prisma.profileMemory.findUnique({ where: { chatKey } });
  return mem?.learned ?? null;
}

// Guarda o aprendizado sobre a pessoa (upsert).
export async function setProfileMemory(chatKey: string, learned: string): Promise<void> {
  await prisma.profileMemory.upsert({
    where: { chatKey },
    create: { chatKey, learned },
    update: { learned },
  });
}