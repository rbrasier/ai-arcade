import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import * as schema from "./schema";

let _db: BetterSQLite3Database<typeof schema> | undefined;

/**
 * Lazy singleton — the connection is only opened on first access so that
 * build-time module evaluation (Next.js page-data workers) never touches
 * the database file. Opening it eagerly at import time made the ~15 parallel
 * build workers all grab the same SQLite file at once, producing
 * `SQLITE_BUSY` (database is locked) and a failed build.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) {
    const dbPath =
      process.env.DATABASE_PATH ?? join(process.cwd(), "data", "arcade.db");
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    _db = drizzle(sqlite, { schema });
  }
  return _db;
}

/**
 * Drop-in replacement: a Proxy that forwards every property access to the
 * lazily-initialised instance. Existing call-sites (`db.select()`, etc.)
 * keep working without any import changes.
 */
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
