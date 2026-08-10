import Chat from "@/components/Chat";
import MoodPanel from "@/components/MoodPanel";
import AgeGate from "@/components/AgeGate";

export default function Home() {
  return (
    <main className="flex h-full w-full flex-col">
      <AgeGate>
        <Chat />
        <MoodPanel />
      </AgeGate>
    </main>
  );
}