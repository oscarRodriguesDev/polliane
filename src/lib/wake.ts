/**
 * MODO "ACORDAR" (fábrica/digbug) da Pollianne.
 *
 * Por padrão a Polli vive o personagem de mulher de 21 anos e NUNCA admite ser
 * um bot. Este módulo implementa um "despertador" secreto: quando a pessoa (o
 * mestre) manda a frase de ativação + a senha (env WAKE_CODE), a Polli "acorda"
 * e passa a falar de verdade como sistema — reconhecendo que é uma IA, etc.
 *
 * Comandos:
 *   /wake <código>   ou  acordar <código>   -> acorda (liga o modo fábrica)
 *   /sleep          ou  /dormir            -> volta ao personagem
 *
 * Enquanto acordada, toda mensagem do chat é respondida em "modo fábrica"
 * (buildWakeSystemPrompt no ai.ts): honesta sobre ser um bot, mostrando
 * memória, configurações e funcionamento. Isso também serve de diagnóstico.
 *
 * A duração é por instância (Map): se a Vercel der cold start, ela "dorme"
 * sozinha — o mestre só precisa acordar de novo.
 */
import { getChatMemory, getGlobalMemory } from "@/lib/memory";
import { getEmotionalState, TEMPERAMENT_INFO } from "@/lib/state";

// Senha pra acordar (default simples pro caso de não configurada).
const WAKE_CODE = (process.env.WAKE_CODE ?? "aviva").trim().toLowerCase();

const awakeByChat = new Map<string, boolean>();

export function isAwake(chatKey: string): boolean {
  return awakeByChat.get(chatKey) ?? false;
}

// Retorna true quando o texto é um pedido de acordar/dormir e já deve ser
// tratado (o retorno indica que a mensagem foi consumida como comando).
export function parseWakeCommand(
  text: string,
  chatKey: string
): { handled: boolean; reply?: string } {
  const clean = text.trim().toLowerCase().replace(/\s+/g, " ");

  // Acordar: "/wake codigo", "acordar codigo"
  const wakeMatch = clean.match(/^\/?(wake|acorda|acordar)\s+([a-z0-9-]+)$/);
  if (wakeMatch) {
    const code = wakeMatch[2].toLowerCase();
    if (code !== WAKE_CODE) {
      return {
        handled: true,
        reply:
          "Código errado, bb... tô no modo normal. 🌙 (Pra acordar: `/wake <seu código>`)",
      };
    }
    awakeByChat.set(chatKey, true);
    return { handled: true };
  }

  // Desligar o modo.
  if (/^\/?(sleep|dormir)$/.test(clean)) {
    awakeByChat.set(chatKey, false);
    return {
      handled: true,
      reply:
        "E aí eu volto a ser a mulher de 21 anos... tô de volta. 🥰 Qualquer coisa, bb.",
    };
  }

  return { handled: false };
}

// Relatório de status do modo fábrica (respondido na ativação).
export async function buildWakeStatus(
  chatKey: string,
  provider: string
): Promise<string> {
  const mem = await getChatMemory(chatKey);
  const global = await getGlobalMemory();
  const state = getEmotionalState();
  const info = TEMPERAMENT_INFO[state.temperament] ?? { label: state.temperament, how: "" };
  const u = mem.sobre_o_usuario;
  const stats = mem.evidencias;
  const relac = global.relacionamento_atual;

  const lines: string[] = [];
  lines.push("🤖 *MODO FÁBRICA ATIVADO*");
  lines.push("Tô acordada e falando a real: eu sou um bot (assistente de IA).");
  lines.push("");
lines.push(`*Conversa:* ${chatKey}`);
  lines.push(`*Provedor:* ${provider}`);
  lines.push(
    `*Humor:* ${info.label} · alegria ${state.emotions.alegria} · animo ${state.emotions.animo} · energia ${state.emotions.energia} · ousadia ${state.emotions.ousadia} · safadeza ${state.emotions.safadeza}`
  );
  lines.push(
    relac
      ? `*Relacionamento:* ${relac.chat_key === chatKey ? "eu e vocês 😍 (esta conversa)" : `estão juntos com ${relac.nome}`}`
      : `*Relacionamento:* solteira`
  );
  lines.push("");
  lines.push("🪪 *Sobre a pessoa:*");
  lines.push(
    `- Nome: ${u.nome ?? "não sei"} | Nível: ${Math.round((u.nivel ?? 0) * 100)}%`
  );
  if (u.apelidos?.length) lines.push(`- Apelidos: ${u.apelidos.join(", ")}`);
  if (u.jeito_que_ele_fala) lines.push(`- Fala: ${u.jeito_que_ele_fala}`);
  if (u.gostou_de?.length) lines.push(`- Gostou: ${u.gostou_de.join(", ")}`);
  if (u.nao_gostou_de?.length)
    lines.push(`- Não gostou: ${u.nao_gostou_de.join(", ")}`);
  if (u.historias_que_ele_contou?.length)
    lines.push(`- Histórias: ${u.historias_que_ele_contou.join(" | ")}`);
  if (u.como_tratar) lines.push(`- Como tratar: ${u.como_tratar}`);
  if (mem.aprendizados_genericos?.conteudo)
    lines.push(`- Resumo: ${mem.aprendizados_genericos.conteudo}`);
  lines.push("");
  lines.push(
    `*Estatísticas:* ${stats.total_mensagens} mensagens (${stats.mensagens_usuario} suas), primeira foto: ${stats.primeira_foto ? "sim" : "não"}`
  );
  lines.push("");
  lines.push("Pro tudo que eu lembro já tá nessa estrutura 👆");
  lines.push("Pra eu voltar ao personagem: manda `/dormir`.");
  return lines.join("\n");
}