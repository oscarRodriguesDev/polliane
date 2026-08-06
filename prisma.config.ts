import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // O CLI (db push / migrate) usa a rota DIRETA (5432); o runtime usa
  // DATABASE_URL (pooler) via adapter-pg em src/lib/db.ts. PgBouncer não
  // cria prepared statements, por isso o CLI fala direto com o Postgres.
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
