// Limites do plano FREE do Supabase, para avisar o mestre antes de estourar.
// (Valores padrão do plano free do Supabase em 2026 — ajuste se o plano mudar.)

export const FREE_LIMITS = {
  dbStorageBytes: 500 * 1024 * 1024, // 500 MB de banco
  dbStorageText: "500 MB",
  storageBytes: 1024 * 1024 * 1024, // 1 GB no Storage (buckets)
  storageText: "1 GB",
  // Cota sugerida por arquivo para não estourar rápido (fotos/vídeos).
  maxPhotoBytes: 8 * 1024 * 1024, // 8 MB
  maxVideoBytes: 100 * 1024 * 1024, // 100 MB
};

export type MediaTag = "normal" | "medium" | "hot_medium" | "hot";

export const MEDIA_TAGS: { value: MediaTag; label: string; emoji: string }[] = [
  { value: "normal", label: "Normal (roupa, sem mostrar nada)", emoji: "👕" },
  { value: "medium", label: "Seminua (calcinha, sutiã, biquíni)", emoji: "🩱" },
  { value: "hot_medium", label: "Mostrando pouco (só seios ou quase nada)", emoji: "🔥" },
  { value: "hot", label: "Picante", emoji: "🌶️" },
];