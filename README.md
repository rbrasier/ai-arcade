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
- **Anthropic Claude** via `@anthropic-ai/sdk`, behind a swappable provider interface

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
  matching row is created on first visit (`src/lib/player.ts`). Players can rename
  themselves via `PATCH /api/player`.
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
  components/arcade/                      # GameList, GameCard, LevelCard, XpProgress, Leaderboard
  components/game/ChallengeRunner.tsx     # shared challenge UI + submit flow
  lib/
    db/{schema,client,seed}.ts
    ai/{provider,anthropic,mock,index}.ts
    player.ts  xp.ts  progress.ts  games.ts
  proxy.ts                                # issues the anonymous player cookie
```

## Configuration

| Variable            | Required | Description                                              |
| ------------------- | -------- | -------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | No\*     | Enables real AI scoring. Omit to use the mock evaluator. |
| `ARCADE_EVAL_MODEL` | No       | Override the evaluation model.                           |
| `DATABASE_PATH`     | No       | SQLite file path (default `./data/arcade.db`).           |

\* The app runs fully without it using a deterministic mock evaluator.
