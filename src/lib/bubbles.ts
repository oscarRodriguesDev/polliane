// Divisão de respostas longas em "balões" curtos, no estilo WhatsApp:
// balão 1: "oi como vc ta eu to bem"
// balão 2: "mas to me sentindo estranha"
// balão 3: "parece que as pessoas não me entendem"
//
// Regra: nenhum balão passa de MAX_BUBBLE_LEN caracteres. A resposta é quebrada
// nos pontos naturais (vírgula, ponto, exclamação, interrogação, quebra de
// linha) para manter a naturalidade. Só quebra no meio de uma palavra se não
// houver outro jeito (caso extremo).

export const MAX_BUBBLE_LEN = 100;

// Divide o texto em unidades menores (sentenças/fragmentos), preservando a
// pontuação que fecha cada uma. Vira uma lista vazia se não houver nada útil.
function naturalUnits(text: string): string[] {
  const parts = text.match(/[^,.;!?…\n]+[,.;!?…]*|\n+/g);
  return (parts ?? []).map((p) => p.trim()).filter(Boolean);
}

// Quebra de um bloco longo que não tem pontuação útil, respeitando palavras.
function forceWrap(block: string, maxLen: number): string[] {
  const words = block.split(/(\s+)/);
  const out: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current) {
      current = w;
      continue;
    }
    if ((current + w).length > maxLen) {
      out.push(current);
      current = w;
    } else {
      current += w;
    }
  }
  if (current) out.push(current);
  return out.filter(Boolean);
}

// Quebra texto numa lista de balões (sempre >= 1, nunca vazio).
export function splitIntoBubbles(text: string, maxLen: number = MAX_BUBBLE_LEN): string[] {
  const normalized = (text ?? "").trim();
  if (!normalized) return [];

  // Se já cabe, é um balão único.
  if (normalized.length <= maxLen) return [normalized];

  const units = naturalUnits(normalized);
  const bubbles: string[] = [];
  let current = "";

  for (const unit of units) {
    const isLineBreak = /^\n+$/.test(unit);
    if (isLineBreak) {
      // Quebra de linha força fechamento do balão atual.
      if (current.trim()) {
        bubbles.push(current.trim());
        current = "";
      }
      continue;
    }

    // Unidade muito longa: força quebrar.
    if (unit.length > maxLen) {
      if (current.trim()) {
        bubbles.push(current.trim());
        current = "";
      }
      for (const chunk of forceWrap(unit, maxLen)) {
        bubbles.push(chunk.trim());
      }
      continue;
    }

    const candidate = current ? `${current} ${unit}` : unit;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      if (current.trim()) bubbles.push(current.trim());
      current = unit;
    }
  }

  if (current.trim()) bubbles.push(current.trim());

  return bubbles.length ? bubbles : [normalized];
}