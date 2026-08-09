/**
 * Memória de longo prazo da Pollianne no formato CHAVE-VALOR.
 *
 * A Pollianne é UMA personalidade que conversa com VÁRIAS pessoas. Ela se
 * comporta como gente de verdade: lembra de todos, mas é discreta — o que uma
 * pessoa conta pra ela fica na memória DAQUELA pessoa, não é repetido pra
 * outra. Ao mesmo tempo, a VIDA DELA (dia a dia, planos, namoro) é global:
 * ela leva isso pra todas as conversas.
 *
 *   GLOBAL (chatKey = "_global"):
 *   {
 *     identidade: "quem ela é",
 *     pessoas_conhecidas: ["Gustavo", "Bia"],
 *     relacionamento_atual: { nome, chat_key } | null,
 *     fatos_da_vida: { chave: valor },
 *   }
 *
 *   POR PESSOA (chatKey = "web" ou "<telegram_id>"):
 *   {
 *     sobre_o_usuario: { nome, apelidos, gostou_de, ... },  // PRIVADO
 *     estado_emocional: {...},
 *     evidencias: { total_mensagens, ... }
 *   }
 *
 * Persistência: Supabase (Postgres), ProfileMemory (chatKey @id, data Json).
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Chave reservada da memória GLOBAL (a personalidade em si).
export const GLOBAL_KEY = "_global";

// ---------- Tipos ----------

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
  estado_emocional: Record<string, number>;
  preferencias_conversa: {
    provedor_atual: string;
  };
  aprendizados_genericos: {
    conteudo?: string; // texto livre reescrito pela IA (privado do chat)
  };
  evidencias: {
    total_mensagens: number;
    mensagens_usuario: number;
    primeira_foto: boolean;
    // Descrição da última foto enviada (a Polli "sabe" o que mandou).
    ultima_foto_desc?: string;
    // Etapa atual do funil de vendas (modo FUNNEL_MODE), quando ativo.
    funnel_step?: number;
  };
};

// Memória global (da personalidade — compartilhada em todas as conversas).
export type GlobalMemory = {
  versao: number;
  atualizado_em: string | null;
  identidade: string;
  pessoas_conhecidas: string[];
  relacionamento_atual: { nome: string; chat_key: string } | null;
  fatos_da_vida: Record<string, string>;
  // Recados deixados pra outras pessoas (pendentes/entregues). Fica dentro do
  // Json global — sem mudar o schema do banco.
  recados: Recado[];
};

// Recado que uma pessoa pediu pra entregar pra outra.
export type Recado = {
  id: string;
  para_nome: string; // nome/apelido do destinatário
  texto: string; // o conteúdo do recado
  de_pessoal: string; // quem deixou o recado
  criado_em: string;
  entregue: boolean;
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
    estado_emocional: {},
    preferencias_conversa: { provedor_atual: "openai" },
    aprendizados_genericos: {},
    evidencias: {
      total_mensagens: 0,
      mensagens_usuario: 0,
      primeira_foto: false,
    },
  };
}

export function emptyGlobalMemory(): GlobalMemory {
  return {
    versao: 1,
    atualizado_em: null,
    identidade:
      "Pollianne Bitencourt, 21 anos, fotógrafa freelancer, mora sozinha, tem a gata Dandara.",
    pessoas_conhecidas: [],
    relacionamento_atual: null,
    fatos_da_vida: {},
    recados: [],
  };
}

// ---------------------- Normalização ----------------------

export function normalizeMemory(raw: unknown): ChatMemory {
  const base = emptyMemory();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ChatMemory>;
  const ru = (r.sobre_o_usuario ?? {}) as Partial<ChatMemory["sobre_o_usuario"]>;

  return {
    versao: r.versao ?? base.versao,
    atualizado_em: r.atualizado_em ?? base.atualizado_em,
    sobre_o_usuario: {
      nome: ru.nome,
      apelidos: Array.isArray(ru.apelidos) ? ru.apelidos : [],
      jeito_que_ele_fala: ru.jeito_que_ele_fala,
      gostou_de: Array.isArray(ru.gostou_de) ? ru.gostou_de : [],
      nao_gostou_de: Array.isArray(ru.nao_gostou_de) ? ru.nao_gostou_de : [],
      historias_que_ele_contou: Array.isArray(ru.historias_que_ele_contou)
        ? ru.historias_que_ele_contou
        : [],
      como_tratar: ru.como_tratar,
      nivel: typeof ru.nivel === "number" ? ru.nivel : base.sobre_o_usuario.nivel,
    },
    estado_emocional: r.estado_emocional ?? {},
    preferencias_conversa: {
      ...base.preferencias_conversa,
      ...(r.preferencias_conversa ?? {}),
    },
    aprendizados_genericos: r.aprendizados_genericos ?? {},
    evidencias: {
      ...base.evidencias,
      ...(r.evidencias ?? {}),
    },
  };
}

export function normalizeGlobalMemory(raw: unknown): GlobalMemory {
  const base = emptyGlobalMemory();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<GlobalMemory>;
  return {
    versao: r.versao ?? base.versao,
    atualizado_em: r.atualizado_em ?? base.atualizado_em,
    identidade: typeof r.identidade === "string" ? r.identidade : base.identidade,
    pessoas_conhecidas: Array.isArray(r.pessoas_conhecidas) ? r.pessoas_conhecidas : [],
    relacionamento_atual: r.relacionamento_atual ?? null,
    fatos_da_vida:
      r.fatos_da_vida && typeof r.fatos_da_vida === "object" ? r.fatos_da_vida : {},
    // Só aceita recados que parecem válidos (descarta lixo do Json antigo).
    recados: Array.isArray(r.recados)
      ? (r.recados as unknown[]).filter(
          (x): x is Recado =>
            !!x &&
            typeof x === "object" &&
            typeof (x as Recado).id === "string" &&
            typeof (x as Recado).para_nome === "string" &&
            typeof (x as Recado).texto === "string" &&
            typeof (x as Recado).de_pessoal === "string" &&
            typeof (x as Recado).criado_em === "string"
        )
      : [],
  };
}

// ---------------------- Leitura/gravação (por chat) ----------------------

export async function getChatMemory(chatKey: string): Promise<ChatMemory> {
  const mem = await prisma.profileMemory.findUnique({ where: { chatKey } });
  return normalizeMemory(mem?.data ?? null);
}

export async function saveChatMemory(chatKey: string, memory: ChatMemory): Promise<void> {
  const data = {
    ...memory,
    atualizado_em: new Date().toISOString(),
  } as Prisma.InputJsonValue;
  await prisma.profileMemory.upsert({
    where: { chatKey },
    create: { chatKey, data },
    update: { data },
  });
}

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

export async function setMemoryField(chatKey: string, path: string, value: unknown): Promise<void> {
  await updateChatMemory(chatKey, (m) => {
    const keys = path.split(".");
    let target: Record<string, unknown> = m as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      target = target[key] as Record<string, unknown>;
    }
    const last = keys[keys.length - 1];
    if (Array.isArray(target[last])) {
      const arr = target[last] as unknown[];
      if (!arr.includes(value)) arr.push(value);
    } else {
      target[last] = value;
    }
  });
}

export async function clearChatMemory(chatKey: string): Promise<void> {
  await prisma.profileMemory.delete({ where: { chatKey } }).catch(() => {});
}

// ---------------------- Leitura/gravação (global) ----------------------

export async function getGlobalMemory(): Promise<GlobalMemory> {
  const mem = await prisma.profileMemory.findUnique({ where: { chatKey: GLOBAL_KEY } });
  return normalizeGlobalMemory(mem?.data ?? null);
}

export async function saveGlobalMemory(g: GlobalMemory): Promise<void> {
  const data = { ...g, atualizado_em: new Date().toISOString() } as Prisma.InputJsonValue;
  await prisma.profileMemory.upsert({
    where: { chatKey: GLOBAL_KEY },
    create: { chatKey: GLOBAL_KEY, data },
    update: { data },
  });
}

export async function updateGlobalMemory(
  fn: (g: GlobalMemory) => GlobalMemory | void
): Promise<GlobalMemory> {
  const g = await getGlobalMemory();
  const result = fn(g);
  if (result) {
    await saveGlobalMemory(result);
    return result;
  }
  await saveGlobalMemory(g);
  return g;
}

// Ela passa a conhecer mais uma pessoa (só o nome, sem segredos).
export async function rememberPerson(nome: string): Promise<void> {
  const clean = nome.trim();
  if (!clean) return;
  await updateGlobalMemory((g) => {
    if (!g.pessoas_conhecidas.includes(clean)) {
      g.pessoas_conhecidas.push(clean);
      g.pessoas_conhecidas = g.pessoas_conhecidas.slice(-100);
    }
  });
}

// Inicia um relacionamento/namoro com a pessoa do chat.
export async function setRelationship(chatKey: string, nome: string): Promise<void> {
  await updateGlobalMemory((g) => {
    g.relacionamento_atual = { nome: nome.trim() || "a pessoa", chat_key: chatKey };
  });
}

// Termina o relacionamento (global).
export async function endRelationship(): Promise<void> {
  await updateGlobalMemory((g) => {
    g.relacionamento_atual = null;
  });
}

// ---------------------- Estatísticas ----------------------

export async function bumpMemoryStats(
  chatKey: string,
  deltaUser: number = 0,
  deltaTotal: number = 0
): Promise<void> {
  await updateChatMemory(chatKey, (m) => {
    m.evidencias.mensagens_usuario += deltaUser;
    m.evidencias.total_mensagens += deltaTotal;
  });
}

// ---------------------- Merge de fatos da IA ----------------------

// Fato privado da pessoa (fica sÃ³ no chat dela).
export type ExtractedFacts = {
  nome?: string;
  jeito_que_ele_fala?: string;
  como_tratar?: string;
  nivel?: number;
apelidos?: string[];
  gostou_de?: string[];
  nao_gostou_de?: string[];
  historias_que_ele_contou?: string[];
  // Fatos da vida da Pollianne que apareceram no papo (vão pro global).
  sobre_o_mundo_da_polli?: Record<string, string>;
};

function uniqueStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(
      list.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim())
    ),
  ].slice(-20);
}

// Aplica o aprendizado privado da pessoa na memória DAQUELE chat.
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
  });

  // Ela registra o nome da pessoa no "pessoas conhecidas" (global).
  if (facts.nome) {
    await rememberPerson(facts.nome);
  }
  // Fatos da vida da Polli vão pro GLOBAL (são dela, não do usuário).
  if (facts.sobre_o_mundo_da_polli) {
    await addLifeFacts(facts.sobre_o_mundo_da_polli);
  }
}

// Registra que uma foto foi enviada (para a Polli "saber" o que mandou).
export async function rememberPhotoSent(
  chatKey: string,
  description?: string
): Promise<void> {
  await updateChatMemory(chatKey, (m) => {
    m.evidencias.primeira_foto = true;
    if (description) {
      m.evidencias.ultima_foto_desc = description;
    }
  });
}

// Fatos do "mundo da Pollianne" são da vida DELA → vão pro global.
export async function addLifeFacts(facts: Record<string, string>): Promise<void> {
  const entries = Object.entries(facts).filter(([k, v]) => k && v && typeof v === "string");
  if (entries.length === 0) return;
  await updateGlobalMemory((g) => {
    for (const [k, v] of entries) {
      g.fatos_da_vida[k] = v;
    }
    const keys = Object.keys(g.fatos_da_vida);
    if (keys.length > 40) {
      for (const k of keys.slice(0, keys.length - 40)) delete g.fatos_da_vida[k];
    }
  });
}