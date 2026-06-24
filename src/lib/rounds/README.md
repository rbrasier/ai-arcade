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

```bash
# Needs a configured AI provider (see src/lib/ai/connector.ts):
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... npm run rounds:generate

npm run rounds:generate -- --count=200          # 200 per game
npm run rounds:generate -- --game=prompt-golf   # one game only
```

`scripts/generate-round-banks.ts` reuses the same generators (with
`fromBank: false`, so it produces fresh scenarios rather than reading the bank
it writes), de-duplicates topics within each bucket, and writes the JSON files
here. The per-game target defaults to **150** (30 per difficulty) and is split
evenly across the game's buckets. It refuses to run without a provider, because
generating against the mock would collapse each bank to one round per bucket.
