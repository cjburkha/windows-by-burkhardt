// Prisma 7 config — connection URL lives here, not in schema.prisma.
// DATABASE_URL is loaded from .env (dev) or injected as an env var (prod/CI).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] || "",
  },
});
