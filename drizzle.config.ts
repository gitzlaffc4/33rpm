import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: (process.env.DATABASE_URL ?? "file:./data/33rpm.db").replace(/^file:/, ""),
  },
  strict: true,
  verbose: true,
});
