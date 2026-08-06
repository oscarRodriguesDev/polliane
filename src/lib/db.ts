import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Prisma 7 exige um driver adapter para conexão direta (Supabase).
// Usa DATABASE_URL (pooler, 6543) no runtime. Migrações/db push usam a
// DIRECT_URL (5432) via prisma.config.ts.
//
// O Supabase exige SSL; o sslmode=require da URL é mapeado para verify-full
// (que rejeita cert auto-assinado), então forçamos rejectUnauthorized:false.

function buildAdapter(): PrismaPg {
  // Remove o sslmode da URL: ele é mapeado para verify-full e sobrepõe a
  // configuração SSL do Pool. Aqui controlamos o SSL via Pool + rejectUnauthorized.
  const url = (process.env.DATABASE_URL ?? "").replace(
    /[?&]sslmode=[^&]*/,
    ""
  );
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  return new PrismaPg(pool);
}

// Singleton global (evita estourar conexões em dev com hot-reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: buildAdapter() });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}