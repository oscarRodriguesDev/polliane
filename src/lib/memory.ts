/**
 * Memória de longo prazo da Pollianne no formato CHAVE-VALOR.
 *
 * Em vez de um texto solto ("Sobre você: ..."), cada chat agora guarda um
 * objeto JSON estruturado — a mesma ideia do `memoria_exemplo.json` — que é
 * persistido no Postgres (Supabase), na coluna `ProfileMemory.data`.
 *
 * Por quê banco e não arquivo? A Polli roda na Vercel, onde o disco é
 * efêmero: um `memoria.json` na raiz seria zerado no cold start. Aqui o
 * JSON vive no banco e nunca some.
 *
 * Estrutura (chave-valor por chat):
 *   {
 *     "versao": 1,
 *     "atualizado_em": "...",
 *     "sobre_o_usuario": { "nome": "...", "apelidos": [...], ... },
 *     "sobre_o_mundo_da_polli": { ... },
 *     "estado_emocional": { "alegria": 0, ... },
 *     "preferencias_do_provedor": { ... },
 *     "aprendizados_genericos": { "conteudo": "..." },
 *     "estatisticas": { "total_mensagens": 0 }
 *   }
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ---------- Tipos (espelham o memoria_exemplo.json) ----------

export type ChatMemory = {
  versao: number;
  atualizado_em: string | null;
  sobre_o_usuario: {
    nome?: string;
    apelidos: string[];
    jeito_que_ele_fala?: string;
    gostou_de: string[];
    nao_gostou_de: string[];
    historias_que_ele_contou: string[];
    como_tratar?: string;
    nivel: number; // 0 = desconhecido .. 1 = total intimidade
  };
  sobre_o_mundo_da_polli: {
    problema_do_dia?: string;
    aversao_da_ultima?: string;
    plano_proximo?: string;
    [k: string]: string | undefined;
  };
  estado_emocional: Record<string, number>;
  preferencias_do_provedor: {
    provedor_atual: string;
  };
  aprendizados_genericos: {
    conteudo?: string;
  };
  estatisticas: {
    total_mensagens: number;
    mensagens_usuario: number;
    primeira_foto: boolean;
  };
};

export function emptyMemory(): ChatMemory {
  return {
    versao: 1,
    atualizado_em: null,
    sobre_o_usuario: {
      apelidos: [],
      gostou_de: [],
      nao_gostou_de: [],
      historias_que_ele_contou: [],
      nivel: 0,
    },
    sobre_o_mundo_da_polli: {},
    estado_emocional: {},
    preferencias_do_provedor: { provedor_atual: "openai" },
    aprendizados_genericos: {},
    estatisticas: {
      total_mensagens: 0,
      mensagens_usuario: 0,
      primeira_foto: false,
    },
  };
}

// Junta a memória salva com a estrutura padrão (garante campos existentes).
export function normalizeMemory(raw: unknown): ChatMemory {
  const base = emptyMemory();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ChatMemory>;

  return {
    versao: 1,
    atualizado_em: r.atualizado_em ?? base.atualizado_em,
    sobre_o_usuario: {
      ...base.sobre_o_usuario,
      ...(r.sobre_o_usuario ?? {}),
      apelidos: r.sobre_o_usuario?.apelidos ?? base.sobre_o_usuario.apelidos,
      gostou_de: r.sobre_o_usuario?.gostou_de ?? base.sobre_o_usuario.gostou_de,
      nao_gostou_de: r.sobre_o_usuario?.nao_gostou_de ?? base.sobre_o_usuario.nao_gostou_de,
      historias_que_ele_contou:
        r.sobre_o_usuario?.historias_que_ele_contou ??
        base.sobre_o_usuario.historias_que_ele_contou,
    },
    sobre_o_mundo_da_polli: r.sobre_o_mundo_da_polli ?? {},
    estado_emocional: r.estado_emocional ?? {},
    preferencias_do_provedor: {
      ...base.preferencias_do_provedor,
      ...(r.preferencias_do_provedor ?? {}),
    },
    aprendizados_genericos: r.aprendizados_genericos ?? {},
    estatisticas: {
      ...base.estatisticas,
      ...(r.estatisticas ?? {}),
    },
  };
}

// ---------- Leitura/gravação no banco ----------

// Lê a memória completa de um chat (ou vazia, se nunca foi gravada).
export async function getChatMemory(chatKey: string): Promise<ChatMemory> {
  const mem = await prisma.profileMemory.findUnique({ where: { chatKey } });
  return normalizeMemory(mem?.data ?? null);
}

// Salva o objeto inteiro (upsert). Substitui a estrutura atual.
export async function saveChatMemory(
  chatKey: string,
  memory: ChatMemory
): Promise<void> {
  const data = { ...memory, atualizado_em: new Date().toISOString() } as Prisma.InputJsonValue;
  await prisma.profileMemory.upsert({
    where: { chatKey },
    create: { chatKey, data },
    update: { data },
  });
}

// ---------- Helpers de edição (chave-valor em profundidade) ----------

// Lê + escreve em uma única operação. útil pra atualizações concorrentes.
export async function updateChatMemory(
  chatKey: string,
  fn: (memory: ChatMemory) => ChatMemory | void
): Promise<ChatMemory> {
  const memory = await getChatMemory(chatKey);
  const result = fn(memory);
  if (result) {
    await saveChatMemory(chatKey, result);
    return result;
  }
  await saveChatMemory(chatKey, memory);
  return memory;
}

// Atribui/merge um valor em um caminho, ex.: "sobre_o_usuario.apelidos".
export async function setMemoryField(
  chatKey: string,
  path: string,
  value: unknown
): Promise<void> {
  await updateChatMemory(chatKey, (m) => {
    const keys = path.split(".");
    let target: Record<string, unknown> = m as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!target[key] || typeof target[key] !== "object") {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    }
    const last = keys[keys.length - 1];
    if (Array.isArray(target[last])) {
      // arrays: adiciona sem duplicar
      const arr = target[last] as unknown[];
      if (!arr.includes(value)) arr.push(value);
    } else {
      target[last] = value;
    }
  });
}

// Apaga toda a memória de um chat (reset do jogo).
export async function clearChatMemory(chatKey: string): Promise<void> {
  await prisma.profileMemory
    .delete({ where: { chatKey } })
    .catch(() => {});
}

// ---------- Estatísticas auxiliares ----------

// Incrementa contadores de estatística de forma atômica (sem corrida).
export async function bumpMemoryStats(
  chatKey: string,
  deltaUser: number = 0,
  deltaTotal: number = 0
): Promise<void> {
  await updateChatMemory(chatKey, (m) => {
    m.estatisticas.mensagens_usuario += deltaUser;
    m.estatisticas.total_mensagens += deltaTotal;
  });
}

// ---------- Merge de fatos extraídos pela IA ----------

// Estrutura que o "extrator de fatos" (prompt no ai.ts) devolve em JSON.
export type ExtractedFacts = {
  nome?: string;
  jeito_que_ele_fala?: string;
  como_tratar?: string;
  nivel?: number; // 0..1
  apelidos?: string[];
  gostou_de?: string[];
  nao_gostou_de?: string[];
  historias_que_ele_contou?: string[];
  sobre_o_mundo_da_polli?: Record<string, string>;
};

function uniqueStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))]
    .slice(-20); // cap de segurança
}

// Aplica os fatos extraídos na memória do chat (upsert em cada campo).
export async function mergeExtractedFacts(
  chatKey: string,
  facts: ExtractedFacts
): Promise<void> {
  await updateChatMemory(chatKey, (mem) => {
    const u = mem.sobre_o_usuario;

    if (facts.nome) u.nome = facts.nome;
    if (facts.jeito_que_ele_fala) u.jeito_que_ele_fala = facts.jeito_que_ele_fala;
    if (facts.como_tratar) u.como_tratar = facts.como_tratar;
    if (typeof facts.nivel === "number") {
      u.nivel = Math.max(0, Math.min(1, facts.nivel));
    }

    u.apelidos = uniqueStrings([...u.apelidos, ...(facts.apelidos ?? [])]);
    u.gostou_de = uniqueStrings([...u.gostou_de, ...(facts.gostou_de ?? [])]);
    u.nao_gostou_de = uniqueStrings([
      ...u.nao_gostou_de,
      ...(facts.nao_gostou_de ?? []),
    ]);
    u.historias_que_ele_contou = uniqueStrings([
      ...u.historias_que_ele_contou,
      ...(facts.historias_que_ele_contou ?? []),
    ]);

    if (facts.sobre_o_mundo_da_polli) {
      for (const [k, v] of Object.entries(facts.sobre_o_mundo_da_polli)) {
        if (k && v && typeof v === "string") {
          mem.sobre_o_mundo_da_polli[k] = v;
        }
      }
    }
  });
}