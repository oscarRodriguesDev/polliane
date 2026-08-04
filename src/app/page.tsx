import Chat from "@/components/Chat";
import MoodPanel from "@/components/MoodPanel";

export default function Home() {
  return (
    <main className="flex h-full w-full flex-col">
      <Chat />
      <MoodPanel />
    </main>
  );
}