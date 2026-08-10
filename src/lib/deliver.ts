/**
 * Liberação do conteúdo após o pagamento ser confirmado.
 *
 * Duas operações:
 *   1. `deliverAllContent(chatKey)` — entrega TUDO de uma vez (pós-pagamento).
 *   2. `deliverNewContent(chatKey)` — quando o usuário (assinante ativo) pergunta
 *      se tem novidade: manda só as mídias NOVAS (id maior que a última entregue).
 *
 * Canais:
 *   - Telegram (chatKey numérica): envia via Bot API (URL ou multipart local).
 *   - Web (chatKey "web"): grava no histórico — aparece ao recarregar/polling.
 *
 * Regra de negócio: o pagamento garante acesso por 1 semana (ver hasActiveAccess
 * em funnel.ts). A entrega pode rodar sempre que a pessoa pedir novo conteúdo
 * dentro do período; fora do período, não entrega.
 */
import path from "node:path";
import { prisma } from "@/lib/db";
import { addMessage } from "@/lib/history";
import { setMemoryField, updateChatMemory } from "@/lib/memory";
import { listLocalPhotos, type LocalPhoto } from "@/lib/photos";
import { sendPhoto, sendPhotoFile, sendText } from "@/lib/telegram";
import { hasSupabaseConfig } from "@/lib/supabase";

// Mensagem curta que abre a entrega do conteúdo (antes das fotos).
const OPENING = (nome?: string) =>
  `Obrigada ${nome?.trim() ? nome.trim() : "amor"}! 💖 Seu apoio caiu e eu liberei TUDO por aqui — fotos e vídeos exclusivos, do jeitinho que você merece. Aproveita! 😘`;

// Mensagem que fecha a entrega: deixa claro que por enquanto é só isso, mas que
// sempre que tiver novidade basta perguntar.
const CLOSING = () =>
  `Por enquanto é só isso, amor! 💕 Mas se eu tiver conteúdo novo, é só me pedir a qualquer momento que eu te mando na hora. 😘`;

// Abertura usada quando a pessoa pede conteúdo NOVO (depois de receber tudo).
const NEW_OPENING = (nome?: string) =>
  `${nome?.trim() ? nome.trim() : "Amor"}! Trouxe as novidades pra você 💖 Segue tudo.`;

// Delay entre envios no Telegram — ritmo natural e evita rate limit.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Deliverable = {
  publicUrl: string;
  filePath?: string;
  description?: string | null;
  /** id da mídia no Supabase (presente só nas mídias do banco). */
  mediaId?: number;
};

// Coleta TODAS as fotos: Supabase (todas as tags) primeiro; se não houver
// nada configurado/nenhuma mídia, usa as locais (leves + picantes).
async function collectAllPhotos(): Promise<Deliverable[]> {
  if (hasSupabaseConfig()) {
    try {
      const medias = await prisma.media.findMany({
        where: { type: "image" },
        orderBy: [{ tag: "asc" }, { id: "asc" }],
        select: { id: true, fileUrl: true, description: true },
      });
      if (medias.length > 0) {
        return medias.map((m) => ({
          mediaId: m.id,
          publicUrl: m.fileUrl,
          description: m.description,
        }));
      }
    } catch (e) {
      console.error("Falha ao listar mídias do Supabase, caindo pro local:", e);
    }
  }

  const locals: LocalPhoto[] = [];
  for (const kind of ["leves", "picantes"] as const) {
    for (const rel of listLocalPhotos(kind)) {
      const filePath = path.join(process.cwd(), "public", "polli", rel);
      const publicUrl =
        "/polli/" + rel.split("/").map(encodeURIComponent).join("/");
      locals.push({ publicUrl, filePath, kind });
    }
  }
  return locals.map((l) => ({ publicUrl: l.publicUrl, filePath: l.filePath }));
}

// Coleta APENAS as fotos NOVAS (id maior que a última entregue).
async function collectNewPhotos(chatKey: string): Promise<Deliverable[]> {
  const ultimoId = await lastDeliveredId(chatKey);
  if (!hasSupabaseConfig()) return []; // sem Supabase não tem como "ranquear" novos

  try {
    const medias = await prisma.media.findMany({
      where: { type: "image", id: { gt: ultimoId } },
      orderBy: { id: "asc" },
      select: { id: true, fileUrl: true, description: true },
    });
    return medias.map((m) => ({
      mediaId: m.id,
      publicUrl: m.fileUrl,
      description: m.description,
    }));
  } catch (e) {
    console.error("Falha ao buscar conteúdo novo:", e);
    return [];
  }
}

function isTelegramChat(chatKey: string): boolean {
  return /^\d+$/.test(chatKey);
}

// Marca o último id de mídia entregue (pra saber o que é "novo" depois).
async function rememberLastDelivered(chatKey: string, ultimoId: number): Promise<void> {
  if (ultimoId > 0) {
    await setMemoryField(chatKey, "evidencias.ultima_media_entregue_id", ultimoId);
  }
}

// Lê o último id de mídia já entregue (0 = nada entregue ainda).
async function lastDeliveredId(chatKey: string): Promise<number> {
  const { getChatMemory } = await import("@/lib/memory");
  const mem = await getChatMemory(chatKey);
  const raw = (mem.evidencias as unknown as Record<string, unknown>)
    .ultima_media_entregue_id;
  return typeof raw === "number" ? raw : 0;
}

// Envia a lista de fotos (Telegram e/ou histórico) e marca o último id.
async function sendPhotos(
  chatKey: string,
  fotos: Deliverable[],
  abertura: string
): Promise<number> {
  const chatId = isTelegramChat(chatKey) ? Number(chatKey) : null;

  if (abertura && abertura.trim()) {
    if (chatId !== null) {
      try {
        await sendText(chatId, abertura);
      } catch {
        /* não bloqueia */
      }
    }
    await addMessage(chatKey, "assistant", abertura, undefined, [abertura]);
  }

  let entregues = 0;
  let ultimoId = 0;
  for (const f of fotos) {
    if (chatId !== null) {
      try {
        if (f.filePath) {
          await sendPhotoFile(chatId, f.filePath, "");
        } else {
          await sendPhoto(chatId, f.publicUrl, "");
        }
      } catch (e) {
        console.error(`Telegram: falha ao enviar foto ${f.publicUrl}:`, e);
        continue;
      }
      await wait(350); // ritmo natural
    }
    await addMessage(chatKey, "assistant", "", f.publicUrl);
    entregues++;
    if (f.mediaId && f.mediaId > ultimoId) ultimoId = f.mediaId;
  }

  if (fotos.length > 0) {
    await rememberLastDelivered(chatKey, ultimoId);
  }
  return entregues;
}

// Encerramento após a entrega (texto novo, sem prometer conteúdo além).
async function closeDelivery(chatKey: string): Promise<void> {
  const fim = CLOSING();
  const chatId = isTelegramChat(chatKey) ? Number(chatKey) : null;
  if (chatId !== null) {
    try {
      await sendText(chatId, fim);
    } catch {
      /* não bloqueia */
    }
  }
  await addMessage(chatKey, "assistant", fim, undefined, [fim]);
}

/**
 * Entrega TODO o conteúdo liberado pra pessoa pós-pagamento.
 * Idempotente: só envia uma vez (flag `conteudo_entregue`).
 * Retorna quantas fotos foram enviadas (0 = já tinha entregue / nada pra enviar).
 */
export async function deliverAllContent(
  chatKey: string,
  nome?: string
): Promise<{ entregues: number; total: number; jaEntregue: boolean }> {
  const { getChatMemory } = await import("@/lib/memory");
  const mem = await getChatMemory(chatKey);
  const evid = mem.evidencias as unknown as Record<string, unknown>;
  if (evid.conteudo_entregue === true) {
    return { entregues: 0, total: 0, jaEntregue: true };
  }

  const fotos = await collectAllPhotos();
  if (fotos.length === 0) {
    await setMemoryField(chatKey, "evidencias.conteudo_entregue", true);
    return { entregues: 0, total: 0, jaEntregue: false };
  }

  const entregues = await sendPhotos(chatKey, fotos, OPENING(nome));
  await closeDelivery(chatKey);

  await updateChatMemory(chatKey, (m) => {
    const e = m.evidencias as unknown as Record<string, unknown>;
    e.conteudo_entregue = true;
    return m;
  });

  console.log(`💚 Conteúdo liberado (${entregues}/${fotos.length} fotos) pro chat "${chatKey}"`);
  return { entregues, total: fotos.length, jaEntregue: false };
}

/**
 * Entrega o conteúdo NOVO (id > última entrega) quando a pessoa pergunta se tem
 * novidade. Requer acesso ativo (dentro da 1 semana). Devolve quantas saíram.
 */
export async function deliverNewContent(
  chatKey: string,
  nome?: string
): Promise<{ entregues: number; total: number }> {
  const fotos = await collectNewPhotos(chatKey);
  if (fotos.length === 0) {
    const chatId = isTelegramChat(chatKey) ? Number(chatKey) : null;
    const msg = "Hoje não, amor... por agora foi só isso que eu publiquei. 💕 Mas se sair coisa nova eu te aviso, pode deixar!";
    if (chatId !== null) {
      try {
        await sendText(chatId, msg);
      } catch {
        /* não bloqueia */
      }
    }
    await addMessage(chatKey, "assistant", msg, undefined, [msg]);
    return { entregues: 0, total: 0 };
  }

  const entregues = await sendPhotos(chatKey, fotos, NEW_OPENING(nome));
  await closeDelivery(chatKey);
  console.log(`💚 Conteúdo NOVO entregue (${entregues} fotos) pro chat "${chatKey}"`);
  return { entregues, total: fotos.length };
}