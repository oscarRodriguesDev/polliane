import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";

/**
 * Motor de geração de imagem via OpenRouter (não usa OpenAI).
 *
 * Usa as fotos de referência em `public/polli` para manter a aparência da
 * Pollianne consistente (img2img via input_references). O modelo padrão é o
 * FLUX.2-max (black-forest), que aceita até 8 referências.
 */

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";
const IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL ?? "black-forest-labs/flux.2-max";

// Pasta com as fotos de referência da Pollianne.
function referenceDir(): string {
  return path.join(process.cwd(), "public", "polli");
}

const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

// Converte cada foto em base64 data URL para passar como referência (máx 8, como o FLUX.2-max suporta).
function listReferenceImages(): string[] {
  try {
    const entries = readdirSync(referenceDir());
    const urls: string[] = [];
    for (const file of entries) {
      const ext = path.extname(file).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) continue;
      const full = path.join(referenceDir(), file);
      const buf = readFileSync(full);
      const dataUrl = `data:image/${ext.slice(1)};base64,${buf.toString("base64")}`;
      urls.push(dataUrl);
      if (urls.length >= 8) break;
    }
    return urls;
  } catch {
    return [];
  }
}

function getKey(): string {
  return process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API ?? "";
}

export async function generateImage(
  prompt: string,
  opts?: { aspectRatio?: string; quality?: string }
): Promise<string> {
  const key = getKey();
  if (!key) {
    throw new Error("Chave do OpenRouter não configurada (OPENROUTER_API_KEY ou OPENROUTER_API).");
  }

  const references = listReferenceImages();
  if (references.length === 0) {
    throw new Error(
      "Nenhuma foto de referência em public/polli. Adicione fotos da Pollíanne para gerar imagens."
    );
  }

  const response = await fetch(OPENROUTER_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      aspect_ratio: opts?.aspectRatio ?? "1:1",
      quality: opts?.quality ?? "high",
      output_format: "png",
      input_references: references.map((url) => ({
        type: "image_url",
        image_url: { url },
      })),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha na geração de imagem (${response.status}): ${text.slice(0, 500)}`);
  }

  const data = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenRouter retornou sem imagem.");
  }

  // Salva a imagem gerada em public/generated/ e devolve o caminho público.
  const buf = Buffer.from(b64, "base64");
  const outDir = path.join(process.cwd(), "public", "generated");
  await mkdir(outDir, { recursive: true });
  const filename = `polli-gen-${Date.now()}.png`;
  await writeFile(path.join(outDir, filename), buf);

  return `/generated/${filename}`;
}