// Seed do usuário mestre do painel admin.
// Uso: npx prisma db seed  (ou _tsx prisma/seed.ts_)
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// SSL: sslmode=require viraria verify-full (rejeita cert auto-assinado do
// Supabase), então removemos o parâmetro da URL e controlamos SSL via Pool.
const prisma = new PrismaClient({
  adapter: new PrismaPg(
    new Pool({
      connectionString: (process.env.DATABASE_URL ?? "").replace(
        /[?&]sslmode=[^&]*/,
        ""
      ),
      ssl: { rejectUnauthorized: false },
    })
  ),
});

async function main() {
  const username = "oscar.rodrigues";
  const password = "175264"; // senha inicial (mestre pode trocar no painel)
  const hash = await bcrypt.hash(password, 10);

  const existing = await prisma.admin.findUnique({ where: { username } });

  if (existing) {
    // Mantém a senha atual; só garante que o mestre existe.
    console.log(`Mestre "${username}" já existe. Nada a fazer.`);
    return;
  }

  await prisma.admin.create({ data: { username, passwordHash: hash } });
  console.log(`Mestre criado: ${username}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });