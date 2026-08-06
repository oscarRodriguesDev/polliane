"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MEDIA_TAGS, FREE_LIMITS, type MediaTag } from "@/lib/media";

type Media = {
  id: number;
  tag: MediaTag;
  type: "image" | "video";
  storagePath: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type Limits = typeof FREE_LIMITS;

const tagLabel: Record<MediaTag, string> = {
  normal: "Normal",
  medium: "Seminua",
  hot_medium: "Hot-medium",
  hot: "Picante",
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [limits, setLimits] = useState<Limits | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedTag, setSelectedTag] = useState<MediaTag>("normal");
  const [selectedType, setSelectedType] = useState<"image" | "video">("image");
  const [file, setFile] = useState<File | null>(null);

  const [media, setMedia] = useState<Media[]>([]);
  const [filterTag, setFilterTag] = useState<MediaTag | "all">("all");
  const [loadingMedia, setLoadingMedia] = useState(false);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // sessão
  useEffect(() => {
    fetch("/api/admin/session")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setUser(d.username);
        setLimits(d.limits);
      })
      .catch(() => router.replace("/admin/login"));
  }, [router]);

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    try {
      const qs = filterTag === "all" ? "" : `?tag=${filterTag}`;
      const res = await fetch(`/api/admin/media${qs}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMedia(data.media);
    } catch {
      setMedia([]);
    } finally {
      setLoadingMedia(false);
    }
  }, [filterTag]);

  useEffect(() => {
    if (user) loadMedia();
  }, [user, filterTag, loadMedia]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploadMsg(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tag", selectedTag);
      fd.append("type", selectedType);
      const res = await fetch("/api/admin/media", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadMsg({ ok: false, text: data.error ?? "Falha no upload." });
        return;
      }
      setUploadMsg({ ok: true, text: "Mídia enviada com sucesso!" });
      setFile(null);
      loadMedia();
    } catch {
      setUploadMsg({ ok: false, text: "Erro de conexão." });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir esta mídia?")) return;
    const res = await fetch(`/api/admin/media?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setMedia((m) => m.filter((x) => x.id !== id));
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Falha ao excluir.");
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    const res = await fetch("/api/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPwMsg({ ok: false, text: data.error ?? "Falha." });
      return;
    }
    setPwMsg({ ok: true, text: "Senha alterada!" });
    setPwCurrent("");
    setPwNew("");
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  const visible = filterTag === "all" ? media : media.filter((m) => m.tag === filterTag);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pink-400">Painel da Pollianne</h1>
          <p className="text-sm text-zinc-500">Logado como <span className="text-zinc-300">{user}</span></p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Sair
        </button>
      </header>

      {limits && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          ⚠️ Plano free do Supabase: <b>{limits.storageText}</b> de Storage e <b>{limits.dbStorageText}</b> de banco.
          Fotos <b>até {Math.round(limits.maxPhotoBytes / 1024 / 1024)} MB</b> e vídeos <b>até {Math.round(limits.maxVideoBytes / 1024 / 1024)} MB</b> por arquivo.
        </div>
      )}

      {/* Upload */}
      <section className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Enviar mídia</h2>
        <form onSubmit={handleUpload} className="grid gap-4">
          <label className="block text-sm text-zinc-400">
            Tipo
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as "image" | "video")}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
            >
              <option value="image">Foto</option>
              <option value="video">Vídeo</option>
            </select>
          </label>

          <label className="block text-sm text-zinc-400">
            Tag
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value as MediaTag)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
            >
              {MEDIA_TAGS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.emoji} {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-zinc-400">
            Arquivo
            <input
              type="file"
              accept={selectedType === "video" ? "video/*" : "image/*"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-pink-600 file:px-4 file:py-2 file:text-sm file:text-white hover:file:bg-pink-500"
            />
          </label>

          {file && (
            <p className="text-xs text-zinc-500">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}

          {uploadMsg && (
            <p className={`rounded-lg px-3 py-2 text-sm ${uploadMsg.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              {uploadMsg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={!file || uploading}
            className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {uploading ? "Enviando..." : "Enviar"}
          </button>
        </form>
      </section>

      {/* Galeria */}
      <section className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Mídias ({visibleCount(media, filterTag)})</h2>
          <div className="ml-auto flex gap-2 text-sm">
            {(["all", ...MEDIA_TAGS.map((t) => t.value)] as (MediaTag | "all")[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilterTag(t)}
                className={`rounded-full px-3 py-1 ${filterTag === t ? "bg-pink-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
              >
                {t === "all" ? "Todas" : tagLabel[t]}
              </button>
            ))}
          </div>
        </div>

        {loadingMedia && <p className="text-sm text-zinc-500">Carregando...</p>}

        {visibleMedia(media, filterTag).length === 0 && !loadingMedia && (
          <p className="rounded-xl border border-dashed border-zinc-700 py-10 text-center text-sm text-zinc-500">
            Nenhuma mídia ainda. Envie acima. (Enquanto vazio, o bot usa as fotos locais.)
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibleMedia(media, filterTag).map((m) => (
            <div key={m.id} className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              {m.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.fileUrl} alt={tagLabel[m.tag]} className="aspect-square w-full object-cover" loading="lazy" />
              ) : (
                <video src={m.fileUrl} className="aspect-square w-full object-cover" muted playsInline />
              )}
              <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                <span className="rounded bg-pink-600/20 px-1.5 py-0.5 text-pink-300">{tagLabel[m.tag]}</span>
                <button onClick={() => handleDelete(m.id)} className="text-red-400 hover:text-red-300">
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trocar senha */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Trocar senha</h2>
        <form onSubmit={handlePassword} className="grid gap-3 sm:grid-cols-2">
          <input
            type="password"
            placeholder="Senha atual"
            value={pwCurrent}
            onChange={(e) => setPwCurrent(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
            autoComplete="current-password"
          />
          <input
            type="password"
            placeholder="Nova senha"
            value={pwNew}
            onChange={(e) => setPwNew(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
            autoComplete="new-password"
          />
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold hover:bg-zinc-600">
              Salvar nova senha
            </button>
            {pwMsg && (
              <span className={`text-sm ${pwMsg.ok ? "text-green-400" : "text-red-400"}`}>{pwMsg.text}</span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function visibleCount(media: Media[], filterTag: MediaTag | "all") {
  return filterTag === "all" ? media.length : media.filter((m) => m.tag === filterTag).length;
}
function visibleMedia(media: Media[], filterTag: MediaTag | "all") {
  return filterTag === "all" ? media : media.filter((m) => m.tag === filterTag);
}