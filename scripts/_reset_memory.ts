import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const msgs = await prisma.chatMessage.count();
  const mems = await prisma.profileMemory.count();
  console.log(`Antes: ChatMessage=${msgs} | ProfileMemory=${mems}`);

  if (process.argv.includes("--apply")) {
    await prisma.chatMessage.deleteMany({});
    await prisma.profileMemory.deleteMany({});
    console.log("Zerado: historico e memoria removidos.");
  } else {
    console.log("PREVIEW — rode com --apply pra apagar.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());