import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/sqlite/index.ts",
  out: "./drizzle/sqlite",
  dbCredentials: { url: "./data/33rpm.db" },
  strict: true,
  verbose: true,
});
