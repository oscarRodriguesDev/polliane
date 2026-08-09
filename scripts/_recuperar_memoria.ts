/**
 * Migração pontual: recupera a memória salva ANTES do parser ficar robusto.
 *
 * O bot guardava o aprendizado no formato ANINHADO:
 *
 *   {"sobre_o_usuario": {"nome": "Oscar", ...}, "sobre_o_mundo_da_polli": {...}}
 *
 * nas colunas `learned` / `data.aprendizados_genericos.conteudo`, mas os campos
 * estruturados de `data` (sobre_o_usuario.nome etc.) ficavam vazios porque o
 * parser só lia chaves no topo. Este script:
 *
 *   1. Lê cada ProfileMemory.
 *   2. Se achar JSON com formato antigo (aprendido), extrai os fatos.
 *   3. Faz MERGE no `data` do chat (nome, gostos, histórias, nivel...).
 *   4. Move `sobre_o_mundo_da_polli` pro GLOBAL (fatos_da_vida).
 *   5. Registra os nomes em `_global .pessoas_conhecidas`.
 *
 * Preview por padrão; rode com --apply pra MUDAR o banco.
 *
 *   npx tsx scripts/_recuperar_memoria.ts          # preview
 *   npx tsx scripts/_recuperar_memoria.ts --apply  # grava
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import type { Prisma } from "@prisma/client";

const GLOBAL_KEY = "_global";

type Extracted = {
  nome?: string;
  jeito_que_ele_fala?: string;
  como_tratar?: string;
  nivel?: number;
  apelidos?: string[];
  gostou_de?: string[];
  nao_gostou_de?: string[];
  historias_que_ele_contou?: string[];
  mundo?: Record<string, string>;
};

function parse(raw: string | null | undefined): Extracted | null {
  if (!raw) return null;
  const candidate = raw.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let root: Record<string, unknown>;
  try {
    root = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const nested =
    root.sobre_o_usuario && typeof root.sobre_o_usuario === "object"
      ? (root.sobre_o_usuario as Record<string, unknown>)
      : null;
  const src = nested ?? root;

  const out: Extracted = {};
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : undefined;

  const nome = str(src.nome);
  if (nome) out.nome = nome;
  const jeito = str(src.jeito_que_ele_fala);
  if (jeito) out.jeito_que_ele_fala = jeito;
  const tratar = str(src.como_tratar);
  if (tratar) out.como_tratar = tratar;
  if (typeof src.nivel === "number") out.nivel = src.nivel;
  const apelidos = arr(src.apelidos);
  if (apelidos) out.apelidos = apelidos;
  const gostou = arr(src.gostou_de);
  if (gostou) out.gostou_de = gostou;
  const naoGostou = arr(src.nao_gostou_de);
  if (naoGostou) out.nao_gostou_de = naoGostou;
  const historias = arr(src.historias_que_ele_contou ?? src.historias);
  if (historias) out.historias_que_ele_contou = historias;

  const worldSrc = root.sobre_o_mundo_da_polli ?? src.sobre_o_mundo_da_polli;
  if (worldSrc && typeof worldSrc === "object") {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(worldSrc as Record<string, unknown>)) {
      if (v && typeof v === "string") clean[k] = v;
    }
    if (Object.keys(clean).length) out.mundo = clean;
  }

  return Object.keys(out).length ? out : null;
}

function unique(list: string[]): string[] {
  return [...new Set(list.filter((x) => x.trim() !== ""))].slice(-50);
}

async function updateGlobalFacts(
  apply: boolean,
  mundo: Record<string, string> | undefined
): Promise<void> {
  if (!mundo || Object.keys(mundo).length === 0) return;

  const globalRow = await prisma.profileMemory.findUnique({ where: { chatKey: GLOBAL_KEY } });
  const g = (globalRow?.data ?? {}) as {
    fatos_da_vida?: Record<string, string>;
  };
  const fatos = { ...(g.fatos_da_vida ?? {}) };
  let changed = false;
  for (const [k, v] of Object.entries(mundo)) {
    if (k && v && !Object.prototype.hasOwnProperty.call(fatos, k)) {
      fatos[k] = v;
      changed = true;
    }
  }
  if (!changed) return;

  if (apply) {
    await prisma.profileMemory.upsert({
      where: { chatKey: GLOBAL_KEY },
      create: { chatKey: GLOBAL_KEY, data: { ...g, fatos_da_vida: fatos } as Prisma.InputJsonObject },
      update: { data: { ...g, fatos_da_vida: fatos } as Prisma.InputJsonObject },
    });
    console.log(`(global) fatos_da_vida += ${Object.keys(mundo).join(", ")}`);
  } else {
    console.log(`(preview) fatos_da_vida += ${Object.keys(mundo).join(", ")}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mems = await prisma.profileMemory.findMany();

  for (const row of mems) {
    if (row.chatKey === GLOBAL_KEY) continue;

    const data = (row.data ?? {}) as {
      sobre_o_usuario?: {
        nome?: string;
        apelidos?: string[];
        gostou_de?: string[];
        nao_gostou_de?: string[];
        historias_que_ele_contou?: string[];
        como_tratar?: string;
        nivel?: number;
      };
      aprendizados_genericos?: { conteudo?: string };
    };

    const learnedSrc =
      (row.learned as string | undefined) ||
      (data.aprendizados_genericos?.conteudo as string | undefined) ||
      "";

    const extracted = parse(learnedSrc);
    if (!extracted) {
      console.log(`= ${row.chatKey}: nada pra migrar`);
      continue;
    }

    const u = data.sobre_o_usuario ?? {};
    const novoNome = u.nome ?? extracted.nome;
    const novoApelidos = unique([...(u.apelidos ?? []), ...(extracted.apelidos ?? [])]);
    const novoGostou = unique([...(u.gostou_de ?? []), ...(extracted.gostou_de ?? [])]);
    const novoNaoGostou = unique([...(u.nao_gostou_de ?? []), ...(extracted.nao_gostou_de ?? [])]);
    const novoHistorias = unique([
      ...(u.historias_que_ele_contou ?? []),
      ...(extracted.historias_que_ele_contou ?? []),
    ]);
    const novoTratar = u.como_tratar ?? extracted.como_tratar;
    const novoNivel = extracted.nivel ?? u.nivel ?? 0;

    const newData = {
      ...data,
      sobre_o_usuario: {
        ...u,
        ...(novoNome ? { nome: novoNome } : {}),
        ...(novoApelidos.length ? { apelidos: novoApelidos } : {}),
        ...(novoGostou.length ? { gostou_de: novoGostou } : {}),
        ...(novoNaoGostou.length ? { nao_gostou_de: novoNaoGostou } : {}),
        ...(novoHistorias.length ? { historias_que_ele_contou: novoHistorias } : {}),
        ...(novoTratar ? { como_tratar: novoTratar } : {}),
        ...(novoNivel > 0 ? { nivel: novoNivel } : {}),
      },
    };

    await updateGlobalFacts(apply, extracted.mundo);

    console.log(
      `[${row.chatKey}] nome=${novoNome ?? "-"} | nivel=${novoNivel} | apelidos=${novoApelidos.join(",") || "-"} | gostos=${novoGostou.length} | histórias=${novoHistorias.length}`
    );

    if (apply) {
      await prisma.profileMemory.update({
        where: { chatKey: row.chatKey },
        data: { data: newData as Prisma.InputJsonObject },
      });
    }
  }

  // Pós-processo: global pessoas_conhecidas vindo de cada chat com nome.
  const mems2 = await prisma.profileMemory.findMany();
  const globalRow = mems2.find((m) => m.chatKey === GLOBAL_KEY);
  const g = (globalRow?.data ?? {}) as { pessoas_conhecidas?: string[] };
  const nomes = unique([
    ...(g.pessoas_conhecidas ?? []),
    ...mems2
      .filter((m) => m.chatKey !== GLOBAL_KEY)
      .map((m) => {
        const d = m.data as { sobre_o_usuario?: { nome?: string } } | null;
        return d?.sobre_o_usuario?.nome ? d.sobre_o_usuario.nome : "";
      })
      .filter(Boolean),
  ]);

  if (nomes.length && apply) {
    await prisma.profileMemory.upsert({
      where: { chatKey: GLOBAL_KEY },
      create: { chatKey: GLOBAL_KEY, data: { ...g, pessoas_conhecidas: nomes } as Prisma.InputJsonObject },
      update: { data: { ...g, pessoas_conhecidas: nomes } as Prisma.InputJsonObject },
    });
  }
  console.log(
    apply
      ? `\n✅ Migração aplicada. pessoas_conhecidas = ${nomes.join(", ")}`
      : `\n👁 Preview — pessoas_conhecidas seria: ${nomes.join(", ")}. Rode com --apply pra gravar.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());