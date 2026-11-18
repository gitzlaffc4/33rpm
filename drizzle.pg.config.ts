import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/pg/index.ts",
  out: "./drizzle/pg",
  // Only used by `drizzle-kit studio`/`push`; generation needs no database.
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/33rpm" },
  strict: true,
  verbose: true,
});
