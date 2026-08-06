// Script de reset do usuário mestre do painel admin.
// Deleta o usuário atual (se existir) e recria com a senha padrão.
// Uso: node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/reset-admin.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

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

const USERNAME = process.env.ADMIN_USERNAME ?? "oscar.rodrigues";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "175264";

async function main() {
  // 1) Deleta o mestre atual
  const deleted = await prisma.admin.deleteMany({
    where: { username: USERNAME },
  });
  console.log(`Deletados ${deleted.count} registro(s) de "${USERNAME}".`);

  // 2) Recria com a senha padrão
  const hash = await bcrypt.hash(PASSWORD, 10);
  const created = await prisma.admin.create({
    data: { username: USERNAME, passwordHash: hash },
  });
  console.log(`Mestre recriado: ${created.username}`);
  console.log(`Credenciais -> usuário: ${USERNAME} | senha: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
