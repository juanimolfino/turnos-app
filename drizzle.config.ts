import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function cleanEnv(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

// Las migraciones corren por la conexión directa (session pooler, puerto 5432):
// el DDL de próximas fases (CREATE EXTENSION, constraints EXCLUDE) falla contra
// el transaction pooler (6543, pgbouncer). El runtime de la app (lib/db) sigue
// usando DATABASE_URL (6543) sin cambios. Fallback a DATABASE_URL si no hay DIRECT_URL.
const migrationUrl = cleanEnv(process.env.DIRECT_URL) || cleanEnv(process.env.DATABASE_URL);

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl
  }
});
