/**
 * Recados entre pessoas.
 *
 * Quando alguém pede EXPLICITAMENTE pra deixar um recado pra outra pessoa
 * ("fala pra fulano que...", "deixa um recado pra ele"...), a IA marca a
 * resposta com a tag invisível [[ENTREGAR: <nome> | <recado>]]. O sistema
 * remove a tag do texto, grava o recado na memória GLOBAL (campo `recados`)
 * e, quando a pessoa destinatária aparecer em outra conversa, entrega.
 *
 * Tudo fica dentro do Json de GlobalMemory (chatKey "_global") — não muda
 * o schema do banco.
 */
import {
  getGlobalMemory,
  updateGlobalMemory,
  type Recado,
} from "@/lib/memory";
import { PICANTE_WORDS } from "@/lib/photos";

// Formato: [[ENTREGAR: <destino> | <recado>]] — o destino não pode ter "|"
// (é o separador); o recado aceita qualquer coisa até fechar o colchete.
const ENTREGAR_TAG_RE = /\[\[ENTREGAR:\s*([^\]|]+)\|([^\]]+)\]\]/;

export type EntregarTagResult = {
  content: string; // texto da resposta SEM a tag
  recado?: { para_nome: string; texto: string };
};

// Detecta a tag [[ENTREGAR: ... | ...]] no texto da resposta da IA, limpa o
// conteúdo e devolve o recado estruturado (se existir).
export function extractEntregarTag(reply: string): EntregarTagResult {
  const match = reply.match(ENTREGAR_TAG_RE);
  if (!match) return { content: reply };
  const para_nome = match[1].trim();
  const texto = match[2].trim();
  return {
    content: reply.replace(match[0], "").trim(),
    recado: para_nome && texto ? { para_nome, texto } : undefined,
  };
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Grava um recado pendente na memória global.
export async function addRecado(rec: {
  para_nome: string;
  texto: string;
  de_nome: string;
}): Promise<void> {
  const para_nome = rec.para_nome.trim();
  const texto = rec.texto.trim();
  if (!para_nome || !texto) return;

  await updateGlobalMemory((g) => {
    g.recados.push({
      id: newId(),
      para_nome,
      texto,
      de_pessoal: rec.de_nome.trim() || "alguém",
      criado_em: new Date().toISOString(),
      entregue: false,
    });
    // Cap de segurança: não deixa a lista crescer sem limite.
    g.recados = g.recados.slice(-200);
  });
}

// Recados que ainda não foram entregues.
export async function getRecadosPendentes(): Promise<Recado[]> {
  const g = await getGlobalMemory();
  return (g.recados ?? []).filter((r) => !r.entregue);
}

// Marca UM recado como entregue.
export async function marcarRecadoEntregue(id: string): Promise<void> {
  await updateGlobalMemory((g) => {
    for (const r of g.recados) {
      if (r.id === id) r.entregue = true;
    }
  });
}

// Marca como entregues todos os recados pendentes destinados a alguma das
// pessoas (nome/apelidos). Comparação case-insensitive e parcial nos dois
// sentidos ("Oscar" casa com "oscar", "khakha"; "khakha" casa com "Oscar").
export async function marcarRecadosEntreguesPara(nomes: string[]): Promise<void> {
  const targets = nomes.filter(Boolean).map((n) => n.trim().toLowerCase());
  if (!targets.length) return;

  const pendentes = await getRecadosPendentes();
  const ids = pendentes
    .filter((r) => {
      const dest = r.para_nome.toLowerCase();
      return targets.some((t) => dest.includes(t) || t.includes(dest));
    })
    .map((r) => r.id);
  if (!ids.length) return;

  await updateGlobalMemory((g) => {
    for (const r of g.recados) {
      if (ids.includes(r.id)) r.entregue = true;
    }
  });
}

// A Polli só manda foto ousada pra quem É seu par: sem relacionamento, ou no
// chat do próprio namorado(a). Em qualquer outro chat ela NÃO pode mandar
// foto picante (gate aplicado antes de escolher a mídia).
export async function isCasadaComEsteChat(chatKey: string): Promise<boolean> {
  const g = await getGlobalMemory();
  const relac = g.relacionamento_atual;
  return !relac || relac.chat_key === chatKey;
}

// A descrição da cena indica foto ousada?
export function isPicanteScene(scene: string): boolean {
  return PICANTE_WORDS.test(scene);
}