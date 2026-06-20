# AI Arcade

An interactive arcade of mini-games that teach people how to work with AI. Play
through games, earn XP, level up, and climb the leaderboard. Game evaluations are
powered by an AI engine so challenges can be scored dynamically.

Built to be **simple to deploy**: a Next.js app + a local SQLite database. The
only external dependency is the AI engine (Anthropic Claude) — and even that is
optional in development thanks to a built-in mock evaluator.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind CSS**
- **SQLite** via **Drizzle ORM** (`better-sqlite3`)
- **A single AI connector** built on the **Vercel AI SDK** (`ai` + `@ai-sdk/*`),
  selectable between **Anthropic**, **OpenAI** and **Amazon Bedrock** via env

## Quick start

```bash
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY for real evaluations
npm run db:push             # create the SQLite schema
npm run db:seed             # load 5 games + demo leaderboard data
npm run dev                 # http://localhost:3000
```

Or do it all in one step:

```bash
./restart.sh                # stop, push schema, seed, and start the dev server
./restart.sh --prod         # build and start in production mode
./restart.sh --no-seed      # skip seeding
```

## How it works

- **Players** are anonymous: a player id cookie is issued by `src/proxy.ts` and the
  matching row is created on first visit (`src/lib/player.ts`) with a placeholder
  name. The first time a player picks a game they're prompted (via a modal) to
  choose a **unique username**; on save they're routed straight into the game.
  Names are validated and de-duplicated by `PATCH /api/player`, which also flags
  the player's `usernameSet`.
- **Games → Challenges → Attempts**: each game has challenges; submitting an answer
  (`POST /api/attempts`) is scored by the AI engine, awarding XP — with bonus XP for
  exceptional answers (`src/lib/ai/`).
- **Levels** are derived from total XP (`src/lib/xp.ts`).
- **Unlocking** (`src/lib/progress.ts`) always keeps at least **2 games playable**:
  you can always access the next two games beyond those you've completed.
- The **leaderboard** toggles between This Week and All Time
  (`src/components/arcade/Leaderboard.tsx`).

## Games

This scaffold seeds 5 games (~2 hours of play). The first two have playable
challenge flows; the rest are placeholders ready for real designs.

1. **Prompt Golf** — hit the target output with the fewest, cleanest words.
2. **Spot the Hallucination** — flag fabricated claims in AI-generated passages.
3. **Few-Shot Architect** _(placeholder)_
4. **Chain of Thought** _(placeholder)_
5. **Eval Designer** _(placeholder)_

## Project layout

```
src/
  app/
    page.tsx                              # Arcade landing (game list + level + leaderboard)
    games/prompt-golf/page.tsx
    games/spot-the-hallucination/page.tsx
    api/{player,games,leaderboard,attempts}/route.ts
  components/arcade/                      # TopNav, GameList, GameCard, GameIcon, PlayerCard, BadgesCard, Leaderboard
  components/game/ChallengeRunner.tsx     # shared challenge UI + submit flow
  lib/
    db/{schema,client,seed}.ts
    ai/{provider,anthropic,mock,index}.ts
    player.ts  xp.ts  progress.ts  games.ts
  proxy.ts                                # issues the anonymous player cookie
```

## Configuration

All AI (challenge scoring **and** the dynamic "Spot the Hallucination"
generator) routes through one connector (`src/lib/ai/connector.ts`). Pick the
provider with `AI_PROVIDER`; if its credentials are missing the arcade falls
back to a deterministic mock so everything still runs offline.

| Variable                | Required | Description                                                             |
| ----------------------- | -------- | ----------------------------------------------------------------------- |
| `AI_PROVIDER`           | No       | `anthropic` (default) \| `openai` \| `bedrock`.                         |
| `AI_MODEL`              | No       | Override the model id (defaults: `claude-sonnet-4-6` / `gpt-4o` / a Bedrock Claude inference profile). |
| `ANTHROPIC_API_KEY`     | No\*     | Required when `AI_PROVIDER=anthropic`.                                   |
| `OPENAI_API_KEY`        | No\*     | Required when `AI_PROVIDER=openai`.                                      |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | No\* | Used when `AI_PROVIDER=bedrock` (or set `AWS_BEDROCK_API_KEY`). |
| `DATABASE_PATH`         | No       | SQLite file path (default `./data/arcade.db`). On Railway, point this at a mounted Volume (e.g. `/data/arcade.db`) so the DB survives deploys. |
| `SITE_PASSWORD`         | No       | Gate the whole arcade behind a shared password (keeps the AI token from being spammed). Unset/blank ⇒ open site. See below. |

\* The app runs fully without any provider configured, using a deterministic
mock evaluator and a built-in bank of hallucination scenarios.

### Access password

Set `SITE_PASSWORD` to require a password before anyone can play. When it's
set, visitors are prompted once by a lock screen; unlocking persists in an
http-only cookie for a year. The gate is enforced in `proxy.ts`, so the
AI-backed API routes return `401` until a visitor unlocks — a direct `curl`
can't burn through your token either. You can also share a link that unlocks
automatically and skips the prompt:

```
https://your-arcade.example.com/?key=YOUR_PASSWORD
```

The `?key=` param is consumed and stripped from the URL on arrival. Leave
`SITE_PASSWORD` unset (or blank) and the arcade is fully open with no prompt.

## Deploying

Any Node host works (`npm run build` then `npm run start`). The database is a
single SQLite file, so the only thing to get right in production is **persisting
that file across deploys**. For Railway — including how to attach a persistent
Volume so player progress isn't wiped on each deploy — see
[`docs/RAILWAY-DEPLOY.md`](docs/RAILWAY-DEPLOY.md).
