# Round banks

Each AI-generated game ships a **static bank** of pre-generated rounds and the
app picks one at **random** at runtime, instead of calling the AI connector on
every play. This keeps play fast, free and repeatable; live AI is only a
fallback.

## Layout

- `bank.ts` — the runtime selector. `pickRound(game, bucket, opts)` returns a
  random round (deep-cloned) for a bucket, honouring `avoidTopics` and an
  optional `predicate`, or `null` when the bank has nothing suitable.
- `banks/<game>.json` — one committed bank per game. Maps a **bucket key** to an
  array of full scenarios (ground truth included — the generate routes strip it
  before sending to the client, exactly as for a live scenario):
  - difficulty games key buckets by difficulty: `"1"`..`"5"`.
  - the Workflow Redesign capstone keys buckets by `scenarioKey`
    (`hr-onboarding`, `expense-review`).

An empty bank (`{}`) yields no pick, so the game falls back to live AI
generation and then its deterministic mock. The arcade is therefore fully
playable before the banks are filled.

## Resolution order

Every `generate*Round` in `src/lib/ai/*` now resolves a round in this order:

1. **Bank** — `pickRound(...)` (unless called with `fromBank: false`).
2. **Live AI** — the AI connector, when a provider is configured.
3. **Mock** — the per-game deterministic bank, so it works fully offline.

## Regenerating the banks

Needs a configured AI provider (see `src/lib/ai/connector.ts`). Either point it
at a provider API:

```bash
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... npm run rounds:generate
```

…or, if you have **Claude Code** installed and logged in, use the `claude-cli`
provider, which shells out to the local CLI and needs **no API key**:

```bash
AI_PROVIDER=claude-cli npm run rounds:generate
```

Flags:

```bash
npm run rounds:generate -- --count=200         # target per game (default 150)
npm run rounds:generate -- --concurrency=10    # parallel generations (default 6)
npm run rounds:generate -- --game=prompt-golf  # one game (comma-separate for several)
```

`scripts/generate-round-banks.ts` reuses the same generators (with
`fromBank: false`, so it produces fresh scenarios rather than reading the bank
it writes) and writes the JSON files here. The per-game target defaults to
**150** (30 per difficulty), split evenly across the game's buckets. It is:

- **Incremental** — each round is written as soon as it's generated, so an
  interrupted run loses nothing.
- **Resumable** — a rerun keeps whatever is already banked and only generates
  the shortfall toward the target. (Bump `--count` to grow a bank further.)
- **Best-effort de-duped** — recent topics are fed back as `avoidTopics` to bias
  variety; the runtime also de-dups within a play-through.

It refuses to run without a provider, because generating against the mock would
collapse each bank to one round per bucket.

> Note: `claude-cli` is for **offline bank generation**, not the deployed web
> app's request path. Generation is slow (~1 model call per round), so filling a
> full 150×9 set takes a while — but it's resumable, so you can do it in passes.
