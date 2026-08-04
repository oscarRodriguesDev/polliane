/**
 * Busca de imagem "parecida" para a Pollianne — sem geração paga.
 *
 * Em vez de gerar a imagem (que exigia créditos no OpenRouter), busca uma foto
 * de banco de imagens (Unsplash) cuja cena combine com a descrição. Retorna o
 * link público da imagem para exibir no chat.
 *
 * Fontes: Unsplash (grátis, sem chave). Google Imagens e DuckDuckGo bloqueiam
 * scraping sem JS, então não são usados.
 */

// Stopwords do PT que não ajudam na busca (e também as equivalentes em EN).
const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "na", "no", "nas", "nos", "em", "com", "para", "por",
  "uma", "um", "uns", "umas", "ela", "eu", "to", "ta", "tô", "tá", "que", "o", "a",
  "and", "the", "with", "in", "on", "at", "a", "an", "of",
]);

// Remove termos que não ajudam na busca e monta a query.
function buildQuery(prompt: string): string {
  const map: Record<string, string> = {
    gata: "cat",
    gato: "cat",
    cachorro: "dog",
    cão: "dog",
    cães: "dogs",
    mulher: "woman",
    menina: "woman",
    garota: "woman",
    "no colo": "on lap",
    brincando: "playing",
    deitada: "lying",
    deitado: "lying",
    "de pé": "standing",
    sorrindo: "smiling",
    praia: "beach",
    cidade: "city",
    café: "coffee",
    cozinha: "kitchen",
    quarto: "bedroom",
    sofá: "sofa",
    dormindo: "sleeping",
    foto: "portrait",
    retrato: "portrait",
    fotógrafa: "photographer",
    camera: "camera",
    // Sensual / moda — coberto pelo banco editorial do Unsplash.
    sensual: "sensual",
    sedutor: "seductive",
    sedutora: "seductive",
    lingerie: "lingerie",
    calcinha: "lingerie",
    sutiã: "lingerie",
    biquini: "bikini",
    "roupa de banho": "swimwear",
    "sem roupa": "nude",
    nua: "nude",
    nu: "nude",
    nudez: "nude",
    seios: "cleavage",
    peitos: "cleavage",
    decote: "cleavage",
    bunda: "curves",
    quadril: "curves",
    corpo: "body",
    pele: "skin",
    "meia-luz": "dim light",
    "luz baixa": "low light",
    banho: "shower",
    cama: "bed",
    "de lingerie": "lingerie",
    provocante: "provocative",
    colchão: "bed",
    "roupa minima": "minimal clothing",
    "só de calcinha": "lingerie",
    "só de sutiã": "lingerie",
    despindo: "undressing",
    "tirando a roupa": "undressing",
    toalha: "towel",
    // Cores comuns.
    preta: "black",
    preto: "black",
    branca: "white",
    branco: "white",
    vermelha: "red",
    vermelho: "red",
    rosa: "pink",
    azul: "blue",
  };
  const words = prompt.toLowerCase().split(/[^a-zà-ú]+/).filter(Boolean);
  const mapped = words
    .filter((w) => !STOPWORDS.has(w))
    .map((w) => map[w] ?? w)
    .filter((w) => !STOPWORDS.has(w));
  return mapped.join(" ").slice(0, 120);
}

async function fetchUnsplash(query: string): Promise<string> {
  const url =
    "https://unsplash.com/napi/search/photos?query=" +
    encodeURIComponent(query) +
    "&per_page=3";
  // Sem User-Agent: o Unsplash devolve 401 quando recebe UA de navegador.
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Unsplash respondeu ${res.status}`);
  }
  const data = (await res.json()) as { results?: Array<{ urls: { regular?: string } }> };
  const photo = data.results?.[0];
  if (!photo?.urls.regular) {
    throw new Error("Nenhuma imagem encontrada para essa cena.");
  }
  return photo.urls.regular;
}

// Gera a URL da imagem "parecida" com a cena descrita.
// Devolve um caminho local via proxy (/api/img) pra imagem carregar sem CORS.
export async function generateImage(
  prompt: string,
  _opts?: { aspectRatio?: string; quality?: string }
): Promise<string> {
  const query = buildQuery(prompt);
  const remote = await fetchUnsplash(query);
  return `/api/img?u=${encodeURIComponent(remote)}`;
}