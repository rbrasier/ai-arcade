# Deploying to Railway (with a persistent SQLite database)

The AI Arcade stores everything — games, players, attempts, XP — in a single
SQLite file (`data/arcade.db` by default). Railway containers have an
**ephemeral filesystem**: the image is rebuilt and the container replaced on
every deploy, so anything written to the normal filesystem (including that
SQLite file) is **wiped on each deploy**. To keep player progress across
deploys you must put the database on a **Railway Volume** — a persistent disk
that survives rebuilds.

## 1. Attach a persistent Volume

Volumes can't be declared in `railway.json`; create one against the service:

- **Dashboard:** open the service → **Settings → Volumes → New Volume**, and set
  the **mount path** to `/data`.
- **CLI:** `railway volume add --mount-path /data`

This gives the container a persistent directory at `/data` that is preserved
across deploys, restarts, and redeploys.

## 2. Point the database at the Volume

Set an environment variable on the service so the app writes the SQLite file
into the mounted volume instead of the ephemeral project directory:

```
DATABASE_PATH=/data/arcade.db
```

Both `src/lib/db/client.ts` (runtime) and `drizzle.config.ts` (migrations) read
`DATABASE_PATH`, so this single variable redirects everything — including the
WAL sidecar files (`arcade.db-wal`, `arcade.db-shm`), which live alongside it in
`/data`.

## 3. How the database is migrated & seeded on deploy

`railway.json` sets the start command to `npm run start:railway`, which runs
`npm run release` before `next start`:

```
release = drizzle-kit push --force   # apply the schema to the volume's DB
        && npm run db:seed:if-empty   # insert the games ONLY if none exist yet
```

- **`drizzle-kit push --force`** creates/updates the schema in place. Schema
  changes in this project are additive (nullable / defaulted columns), so this
  is non-destructive and existing player rows are preserved.
- **`db:seed:if-empty`** is the important part for persistence. The normal
  `db:seed` is **destructive** — it deletes all players and attempts before
  re-inserting the games. The `--if-empty` variant first checks whether any
  games already exist and, if so, **does nothing** — so a redeploy against a
  populated volume never wipes accumulated player progress. The full seed only
  runs on the very first deploy (empty volume).

## 4. Build safety

`src/lib/db/client.ts` opens the SQLite connection **lazily** (on first query),
not at import time. During `next build` the ~15 parallel page-data workers all
import the db module; opening the file eagerly made them collide on the same
SQLite file and fail the build with `SQLITE_BUSY` (database is locked). The lazy
singleton means build workers that only import the module never touch the file.

## 5. Other environment variables

See the table in [`README.md`](../README.md#configuration). At minimum on
Railway you'll typically set:

| Variable          | Value                | Why                                            |
| ----------------- | -------------------- | ---------------------------------------------- |
| `DATABASE_PATH`   | `/data/arcade.db`    | Persist the SQLite file on the mounted Volume. |
| `ANTHROPIC_API_KEY` (optional) | your key | Real AI scoring; omit to use the built-in mock. |

`PORT` is provided by Railway automatically and is honoured by the start
command.

## Quick checklist

1. Add a Volume mounted at `/data`.
2. Set `DATABASE_PATH=/data/arcade.db`.
3. Deploy. The first deploy seeds the games; every later deploy keeps the
   existing data and only applies schema changes.
