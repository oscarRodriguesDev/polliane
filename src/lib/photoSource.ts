/**
 * Fonte de mídias da Pollianne.
 *
 * Ordem de preferência:
 *   1. Supabase Storage + banco (Media) — mídias enviadas pelo mestre via painel,
 *      com tag por nível de ousadia (normal | medium | hot_medium | hot).
 *   2. Fotos locais (public/polli) — fallback enquanto o storage estiver vazio.
 *   3. Geração remota (Unsplash) — quando nada existir em nenhum dos anteriores.
 *
 * A curva de "calor" (safadeza + progresso da conversa) escolhe a TAG do Supabase,
 * igual já acontecia pra decidir entre pastas leves/picantes locais.
 */
import { prisma } from "@/lib/db";
import { hasSupabaseConfig } from "@/lib/supabase";
import type { MediaTag } from "@/lib/media";
import { pickLocalPhotoForScene, type LocalPhoto } from "@/lib/photos";

export type MediaSourceResult =
  | { publicUrl: string; filePath?: undefined; remote?: undefined; description?: string }
  | { publicUrl?: undefined; filePath: string; remote?: undefined; description?: string }
  | { publicUrl?: undefined; filePath?: undefined; remote: true; description?: string }
  | null;

// Curva de calor -> tag do Supabase (mais ousada conforme conversa esquenta).
// Fotos locais têm 2 níveis (leves/picantes); o Supabase tem 4, então a curva
// de 0..1 vira índice num array ordenado de tags.
function resolveSupabaseTag(
  scene: string,
  safadeza: number,
  progress: number
): MediaTag | null {
  const heat =
    (Math.min(Math.max(safadeza, 0), 100) / 100) * 0.4 +
    Math.min(Math.max(progress, 0), 1) * 0.6;

  // Curva mais solta: as fotos mais ousadas ficam acessíveis bem antes.
  // heat>=0.5 já dá "hot" no meio, e com progress baixo as picantes aparecem.
  const order: MediaTag[] = ["normal", "medium", "hot_medium", "hot"];
  const idx = Math.floor((heat + 0.25) * order.length);
  return order[Math.min(idx, order.length - 1)];
}

// Palavras removidas da scoring (conectivos e semântica fraca), em PT e EN.
const SCORE_STOPWORDS =
  /[^\p{L}\p{N}]+/u;

// Normaliza e devolve as palavras significativas de uma frase (em minúsculas).
function words(text: string): string[] {
  return (text ?? "")
    .toLowerCase()
    .split(SCORE_STOPWORDS)
    .filter(
      (w) =>
        w.length > 2 &&
        ![
          "pra", "pro", "com", "uma", "uma", "uns", "umas", "ela", "ele", "que",
          "para", "tem", "estou", "na", "no", "das", "dos", "muito", "mais", "de", "da",
        ].includes(w)
    );
}

// Escore de casamento entre a cena ([[FOTO: ...]]) e a descrição da foto.
// Quanto mais palavras em comum, maior. Cena vazia → 0 (aleatório).
function scoreMatch(scene: string, description: string | null | undefined): number {
  if (!description) return 0;
  const a = new Set(words(scene));
  const b = words(description);
  if (a.size === 0) return 0;
  let score = 0;
  for (const w of b) if (a.has(w)) score++;
  return score;
}

// Procura uma mídia (foto) no banco/storage do Supabase. Se a tag ideal não
// tiver nada, desce pra tag com menos ousadia até achar (fallback gradual).
// Entre as candidatas da tag, ranqueia pela descrição que coincide com a cena
// (a IA "sabe" o que está mandando e o bot escolhe a foto certa pra cena).
async function pickSupabaseMedia(
  scene: string,
  tag: MediaTag
): Promise<{ fileUrl: string; storagePath: string; description?: string | null } | null> {
  const order: MediaTag[] = ["normal", "medium", "hot_medium", "hot"];
  const start = order.indexOf(tag);
  for (let i = start; i >= 0; i--) {
    const candidates = await prisma.media.findMany({
      where: { tag: order[i], type: "image" },
      select: { fileUrl: true, storagePath: true, description: true },
    });
    if (candidates.length === 0) continue;

    // Preferir a foto cuja descrição mais bate com a cena; se ninguém tiver
    // descrição ou escore empate, escolhe aleatória.
    let best = candidates;
    let bestScore = -1;
    for (const c of candidates) {
      const s = scoreMatch(scene, c.description);
      if (s > bestScore) {
        bestScore = s;
        best = [c];
      } else if (s === bestScore) {
        best.push(c);
      }
    }
    const pick = best[Math.floor(Math.random() * best.length)];
    return pick;
  }
  return null;
}

// Resolve um pedido de foto priorizando Supabase, depois local e (se o caller
// permitir) marca pra tentar geração remota. Retorna o resultado acionável.
export async function pickResolvedMedia(
  scene: string,
  safadeza: number,
  progress: number,
  opts: { enableUnsplash?: boolean; forceLocalOnly?: boolean } = {}
): Promise<MediaSourceResult> {
  // 1) Supabase primeiro (se configurado e não forçado local).
  if (!opts.forceLocalOnly && hasSupabaseConfig()) {
    try {
      const tag = resolveSupabaseTag(scene, safadeza, progress);
      if (tag) {
        const remote = await pickSupabaseMedia(scene, tag);
        if (remote) {
          // URL pública do bucket (anon já consegue ler).
          return { publicUrl: remote.fileUrl, description: remote.description ?? undefined };
        }
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("Supabase indisponível, caindo pro local:", detail);
    }
  }

  // 2) Local fallback (public/polli).
  const local: LocalPhoto | null = pickLocalPhotoForScene(
    scene,
    safadeza,
    progress
  );
  if (local) {
    return { publicUrl: local.publicUrl };
  }

  // 3) Nada local: se o caller permitir, marca geração remota (Unsplash).
  return opts.enableUnsplash ? { remote: true } : null;
}