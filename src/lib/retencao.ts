/**
 * RETENÇÃO AUTOMÁTICA (divulgação de custo ZERO — a alavanca do plano de
 * marketing). Um único job varre todos os chats e dispara mensagens de
 * reativação pra quem parou no meio do funil e de recuperação pra quem já
 * pagou e deixou o acesso vencer.
 *
 * Regra de ouro do plano: com ticket de R$ 10, o lead mais barato é quem já
 * entrou no bot. Reativar é sempre mais barato que adquirir.
 *
 * Gatilhos:
 *  1. SEM PAGAR na etapa 4 há 24h+  → reativa ("não vai me deixar esperando")
 *  2. ACESSO VENCIDO (7 dias)       → oferece renovação com conteúdo novo
 *
 * Como disparar (cron gratuito):
 *   GET https://<site>/api/retencao?key=<RETENCAO_KEY>
 *   - Vercel Cron (vercel.json) ou cron-job.org — a cada 12–24h.
 *
 * Idempotente: cada gatilho só dispara UMA vez por chat (flags guardadas na
 * própria memória do chat).
 */
import { prisma } from "@/lib/db";
import { sendText } from "@/lib/telegram";
import { setMemoryField } from "@/lib/memory";
import type { ChatMemory } from "@/lib/memory";

// Espera mínima na etapa 4 antes de reativar (24h).
const ETAPA4_ESPERA_MS = 24 * 60 * 60 * 1000;

// Mensagens de reativação (etapa 4 sem pagar). Variam pra não parecer robô.
const REATIVACAO_MSGS: string[] = [
  "e aí, vai mesmo me deixar esperando? 😏 eu tava quase te mostrando tudo...",
  "num vai me deixar no vácuo, né? 😌 a chave é R$10 e eu libero tudo na hora.",
  "tô aqui te esperando, amor. R$10 e a semana é toda minha. 💕",
];

// Mensagens de renovação (acesso vencido).
const RENOVACAO_MSGS: string[] = [
  "sua semaninha acabou, bb... 🥺 mas trouxe coisa nova. é só renovar que eu te mostro 😘",
  "faz tempo que você não aparece... o acesso venceu, mas as novidades tão guardadas pra você 💕",
  "sumiu de mim, hein... renovo teu acesso por R$10 e te entrego o que saiu de novo 😏",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface RetencaoResult {
  escaneados: number;
  reativados_etapa4: number;
  renovados: number;
  erros: number;
}

export async function runRetencao(): Promise<RetencaoResult> {
  const result: RetencaoResult = {
    escaneados: 0,
    reativados_etapa4: 0,
    renovados: 0,
    erros: 0,
  };

  // Varre TODAS as memórias persistidas. Só chats do Telegram (chatKey
  // numérica) recebem push — o "web" não tem como receber mensagem fora do site.
  const rows = await prisma.profileMemory.findMany();

  for (const row of rows) {
    const chatKey = row.chatKey;
    // Só Telegram: chatKey é o chat_id numérico.
    if (!/^\d+$/.test(chatKey)) continue;

    const chatId = Number(chatKey);
    if (!Number.isSafeInteger(chatId) || chatId <= 0) continue;

    const mem = (row.data ?? {}) as Partial<ChatMemory>;
    const ev = (mem.evidencias ?? {}) as ChatMemory["evidencias"];
    result.escaneados++;

    try {
      // --- Gatilho 1: parou na etapa 4 sem pagar há 24h+ ---
      const step = typeof ev.funnel_step === "number" ? ev.funnel_step : Number(ev.funnel_step) || 0;
      const naEtapa4 = step === 4;
      const assinante = Boolean(ev.assinante);
      const jaReativou = Boolean(ev.reativacao_etapa4_enviada);

      if (naEtapa4 && !assinante && !jaReativou && ev.funnel_etapa4_desde) {
        const desde = new Date(ev.funnel_etapa4_desde).getTime();
        if (Number.isFinite(desde) && Date.now() - desde >= ETAPA4_ESPERA_MS) {
          await sendText(chatId, pick(REATIVACAO_MSGS));
          await setMemoryField(chatKey, "evidencias.reativacao_etapa4_enviada", true);
          result.reativados_etapa4++;
        }
      }

      // --- Gatilho 2: assinante com acesso vencido (1 semana) ---
      const jaRenovou = Boolean(ev.renovacao_enviada);
      if (assinante && !jaRenovou && ev.conteudo_liberado_ate) {
        const venceu = new Date(ev.conteudo_liberado_ate).getTime();
        if (Number.isFinite(venceu) && Date.now() > venceu) {
          await sendText(chatId, pick(RENOVACAO_MSGS));
          await setMemoryField(chatKey, "evidencias.renovacao_enviada", true);
          result.renovados++;
        }
      }
    } catch (error) {
      result.erros++;
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`Retenção falhou pro chat ${chatKey}:`, detail);
    }
  }

  return result;
}