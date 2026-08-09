/**
 * Liberação em massa do conteúdo após o pagamento ser confirmado.
 *
 * Quando o webhook do Asaas confirma o PIX, `deliverAllContent(chatKey)`:
 *   1. Coleta TODAS as fotos (Supabase primeiro; local public/polli como fallback);
 *   2. Envia uma a uma pra pessoa:
 *      - Telegram (chatKey numérica): envia via Bot API (URL ou multipart local);
 *      - Web (chatKey "web"): grava no histórico — aparece ao recarregar/proxima leitura;
 *   3. Marca `conteudo_entregue` na memória (idempotente — não reenvia).
 *
 * A entrega é segura pra repetição: se o Asaas reenviar o webhook, a flag
 * impede reenvio duplicado.
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

// Delay entre envios no Telegram — ritmo natural e evita rate limit.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Deliverable = {
  publicUrl: string;
  filePath?: string;
  description?: string | null;
};

// Coleta TODAS as fotos: Supabase (todas as tags) primeiro; se não houver
// nada configurado/nenhuma mídia, usa as locais (leves + picantes).
async function collectAllPhotos(): Promise<Deliverable[]> {
  if (hasSupabaseConfig()) {
    try {
      const medias = await prisma.media.findMany({
        where: { type: "image" },
        orderBy: [{ tag: "asc" }, { id: "asc" }],
        select: { fileUrl: true, description: true },
      });
      if (medias.length > 0) {
        return medias.map((m) => ({
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

function isTelegramChat(chatKey: string): boolean {
  return /^\d+$/.test(chatKey);
}

/**
 * Entrega todo o conteúdo liberado pra pessoa pós-pagamento.
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

  const chatId = isTelegramChat(chatKey) ? Number(chatKey) : null;

  // Mensagem de abertura.
  const abertura = OPENING(nome);
  if (chatId !== null) {
    await sendText(chatId, abertura);
  }
  await addMessage(chatKey, "assistant", abertura, undefined, [abertura]);

  // Envia as fotos em sequência (Telegram) e registra no histórico.
  let entregues = 0;
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
  }

  // Encerramento carinhoso.
  const fim =
    "E tem MUITO mais de onde veio! Qualquer coisa me chama, tô sempre por aqui pra você 😘💕";
  if (chatId !== null) {
    try {
      await sendText(chatId, fim);
    } catch {
      /* não bloqueia */
    }
  }
  await addMessage(chatKey, "assistant", fim, undefined, [fim]);

  await updateChatMemory(chatKey, (m) => {
    const e = m.evidencias as unknown as Record<string, unknown>;
    e.conteudo_entregue = true;
    return m;
  });

  console.log(`💚 Conteúdo liberado (${entregues}/${fotos.length} fotos) pro chat "${chatKey}"`);
  return { entregues, total: fotos.length, jaEntregue: false };
}