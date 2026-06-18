import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { defineConfig } from "drizzle-kit";

const dbPath = process.env.DATABASE_PATH ?? "./data/arcade.db";

// drizzle-kit won't create the directory for us, so ensure it exists.
const dir = dirname(dbPath);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: dbPath,
  },
});
