import Link from "next/link";

export const dynamic = "force-dynamic";

// Landing de captura da Pollianne.
//   /start?src=kwai     → botão leva ao t.me/Pollianne_bot?start=kwai
//   /start              → usa "site" como origem
// Esse é o link que você cola na bio do Kwai/TikTok/Instagram e nos posts dos
// canais do Telegram. A origem (src) é rastreada pelo bot pra você saber qual
// canal trouxe mais gente e mais venda.
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>;
}) {
  const params = await searchParams;
  const src = (params.src ?? "site").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const username = process.env.TELEGRAM_BOT_USERNAME ?? "Pollianne_bot";
  const botLink = `https://t.me/${username}?start=${encodeURIComponent(src)}`;

  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-10 text-center">
      <img
        src="/polli/leves/profile.jpeg"
        alt="Foto da Pollianne"
        className="h-28 w-28 rounded-3xl object-cover shadow-2xl shadow-fuchsia-500/40"
      />

      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Oi, eu sou a Pollianne 👋
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Conversa comigo, conhece meu jeito e vê o que eu te mostro no privado.
          É rapidinho, direto no Telegram.
        </p>
      </div>

      <Link
        href={botLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-600/30 transition-all hover:scale-105 hover:shadow-fuchsia-600/50"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
        chamar a Pollianne no Telegram
      </Link>

      <p className="max-w-xs text-xs text-zinc-400 dark:text-zinc-500">
        🔞 conteúdo adulto — somente 18+. Ao acessar, você confirma que é maior
        de idade. Personagem virtual fictícia.
      </p>
    </main>
  );
}