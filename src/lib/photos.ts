/**
 * Fotos locais da Pollianne (public/polli).
 *
 * Duas pastas:
 * - public/polli/leves/   — fotos normais/casuais (contém também a foto de perfil: profile.jpeg)
 * - public/polli/picantes/ — fotos mais ousadas (liberadas com a progressão da conversa)
 *
 * O bot manda essas fotos quando a IA usa a tag [[FOTO: ...]] no fim da resposta
 * (disparo espontâneo "vez por outra" ou sob demanda). A pasta escolhida respeita
 * a PROGRESSÃO: no começo da conversa só saem fotos leves; conforme a conversa
 * esquenta (nível de safadeza + quantidade de mensagens), as picantes são liberadas.
 *
 * No futuro as pastas vão receber vídeos (ex.: public/polli/videos) — basta
 * adicionar um novo PhotoKind e estender listLocalPhotos.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

export type PhotoKind = "leves" | "picantes";

export type LocalPhoto = {
  /** Caminho público servido pelo Next (ex.: /polli/picantes/picante2.jpeg). */
  publicUrl: string;
  /** Caminho absoluto no disco (usado pra enviar o arquivo ao Telegram). */
  filePath: string;
  kind: PhotoKind;
};

const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// Palavras que indicam foto mais ousada na descrição da tag.
const PICANTE_WORDS =
  /picante|sensual|lingerie|calcinha|sutiã|sutia|sexy|nua|\bnu\b|quente|provocante|sedut|banho|biquini|safada|tesão|tesao|corpo|peito|bunda|toalha|meia-luz|meia luz|despind|tirando a roupa|de quatro|na cama/i;

// Palavras que indicam foto comum/casual na descrição da tag.
const LEVE_WORDS =
  /leve|normal|casual|dia a dia|comum|sorrindo|rosto|bonita|selfie|rindo|simples|dandara|gata|café|cafe|rua|passeio|rolê|role|no parque|na praia|trabalho|ensaiando/i;

function photosDir(): string {
  return path.join(process.cwd(), "public", "polli");
}

// Lista os arquivos de imagem de uma pasta (caminhos relativos tipo "leves/x.jpeg").
export function listLocalPhotos(kind: PhotoKind): string[] {
  const dir = path.join(photosDir(), kind);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => EXTENSIONS.has(path.extname(n).toLowerCase()))
    .map((n) => `${kind}/${n}`)
    .sort();
}

function toPublicUrl(rel: string): string {
  // Codifica nomes com espaço ("picante 5.jpeg") pra URL válida.
  return "/polli/" + rel.split("/").map(encodeURIComponent).join("/");
}

// Sorteia uma foto da pasta (evitando repetir `exclude` quando possível).
export function pickLocalPhoto(kind: PhotoKind, exclude?: string): LocalPhoto | null {
  const photos = listLocalPhotos(kind);
  if (photos.length === 0) return null;
  const pool = exclude ? photos.filter((p) => p !== exclude) : photos;
  const rel = (pool.length ? pool : photos)[Math.floor(Math.random() * (pool.length ? pool : photos).length)];
  return {
    publicUrl: toPublicUrl(rel),
    filePath: path.join(photosDir(), rel),
    kind,
  };
}

// Define se a foto deve ser leve ou picante:
// - descrição explícita de leve → sempre leve;
// - descrição explícita de picante → só se o estágio liberar;
// - sem descrição clara → decide pelo "calor" (safadeza + progresso da conversa).
export function resolveKind(scene: string, safadeza: number, progress: number): PhotoKind {
  const s = scene.trim();
  if (LEVE_WORDS.test(s)) return "leves";
  return decideByHeat(safadeza, progress);
}

function decideByHeat(safadeza: number, progress: number): PhotoKind {
  // Progresso pesa mais que safadeza: "com o passar do tempo" é o que manda.
  const heat = (Math.min(Math.max(safadeza, 0), 100) / 100) * 0.4 + Math.min(Math.max(progress, 0), 1) * 0.6;
  return heat >= 0.5 ? "picantes" : "leves";
}

// Sorteia a foto certa pra cena/tag, com fallback pra outra pasta se estiver vazia.
export function pickLocalPhotoForScene(
  scene: string,
  safadeza: number,
  progress: number
): LocalPhoto | null {
  const kind = resolveKind(scene, safadeza, progress);
  const photo = pickLocalPhoto(kind);
  if (photo) return photo;
  // Pasta vazia: tenta a outra antes de desistir.
  return pickLocalPhoto(kind === "leves" ? "picantes" : "leves");
}

// Extrai um pedido de foto da resposta da IA e devolve o texto limpo + a cena.
// Aceita vários formatos (a IA nem sempre usa a tag certinha):
//   1. Tag estruturada:  [[FOTO: leve]] / [[FOTO: picante]] / [[FOTO: descrição]]
//   2. Tag cortada no fim pelo max_tokens:  "...[[FOTO: leve" (sem fechar)
//   3. Placeholder literal:  "[foto]" / "[Foto]" / "[imagem]" / "[fotos]"
//   4. Só o TEXTO: quando ela age como se tivesse mandado ("olha lá, não
//      espalha", "te mandei", "tá aí...", "vai rir de mim não hein") — detectado
//      por indícios de envio + vergonha. Negativas explícitas ("não vou te
//      mandar") NÃO disparam foto.
// Devolve null quando a resposta não tem pedido de foto.
export function extractPhotoRequest(
  reply: string,
  userMessage?: string
): { content: string; scene: string } | null {
  // 1. Tag estruturada completa.
  const tag = reply.match(/\[\[FOTO: ([\s\S]*?)\]\]/);
  if (tag) {
    return { content: reply.replace(tag[0], "").trim(), scene: tag[1].trim() };
  }

  // 2. Tag aberta sem fechar (resposta cortada no fim).
  const openTag = reply.match(/\[\[FOTO: ([^\]]*)\s*$/);
  if (openTag) {
    return { content: reply.replace(openTag[0], "").trim(), scene: openTag[1].trim() };
  }

  // 3. Placeholder literal "[foto]" (a IA copia isso dos exemplos).
  const literal = reply.match(/\[\s*(?:foto|fotos|imagem|pic)\s*\]/i);
  if (literal) {
    return { content: reply.replace(literal[0], "").trim(), scene: "" };
  }

  // 4. Texto puro: ela agiu como quem mandou a foto (indício de envio/vergonha).
  //    Exige uma REFERÊNCIA a foto junto de um indício de envio OU (se o usuário
  //    pediu) um indício de envio sozinho. Recusas explícitas nunca disparam foto.
  if (DENY_PHOTO_HINTS.test(reply)) return null; // "não vou te mandar", "calma lá"...

  const referenced = PHOTO_REFERENCE.test(reply); // fala de foto no texto
  const sent = SEND_PHOTO_HINTS.test(reply); // "olha lá", "tá aí", "te mandei"...
  const shamed = SHAME_PHOTO_HINTS.test(reply); // "não espalha", "vai rir de mim"...
  const asked = userMessage ? USER_ASKED_PHOTO.test(userMessage) : false;

  if (referenced && (sent || shamed)) {
    return { content: reply.trim(), scene: "" };
  }
  if (asked && (sent || shamed)) {
    return { content: reply.trim(), scene: "" };
  }

  return null;
}

// Referência a foto no texto da resposta.
const PHOTO_REFERENCE = /(foto|fotinha|foto minha|fotinha minha|clique|selfie|imagem)/i;

// Indícios de que ela mandou/está mandando a foto (sem precisar da palavra "foto").
const SEND_PHOTO_HINTS =
  /(tá aí|\bolha aí\b|\bolha lá\b|aí vai|segue aí|recebe aí|chega aí|toma aí|no teu dm|no seu privado|te mandei|\bmandei\b|mando aí|mando aqui|vou te mandar|vou mandar|tô te mandando|to te mandando|acabei de te mandar)/i;

// Sinais de vergonha ao mandar (reforçam que ela mandou, mesmo sem dizer "foto").
const SHAME_PHOTO_HINTS =
  /(vai rir de mim|rir de mim|não espalha|nao espalha|sem espalhar|não vai rir|nao vai rir|não vou rir|nao vou rir|vergonha|envergonh|apaga depois|tô vermelha|to vermelha|não olha|nao olha|não repara|nao repara|tô com receio|to com receio)/i;

// Negações: ela recusou mandar → não anexa foto.
const DENY_PHOTO_HINTS =
  /(não vou|nao vou|não mando|nao mando|não te mando|nao te mando|não envio|nao envio|nem pensar|recuso|não vai dar|nao vai dar|esquece|nem a pau|nem fodendo|nem ferrando|deixa pra lá|não tenho foto|nao tenho foto|calma lá|calma aí|mal se conhece|nem te conheço|só se for|quem sabe|primeiro me diz)/i;

// Usuário pediu foto na mensagem dele.
const USER_ASKED_PHOTO =
  /(foto|fotinha|foto sua|manda foto|me manda|me mostra|quero te ver|quero ver|ver você|selfie|nudes?|uma foto sua|foto agora)/i;
