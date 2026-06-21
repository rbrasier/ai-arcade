@AGENTS.md

# Game rules

All games share a common set of scoring, XP-bonus, clear/unlock and duration
rules. These are documented in @docs/GAME-RULES.md and are wired into the code
(`src/lib/xp.ts`, `src/lib/progress.ts`, `src/app/api/attempts/route.ts`, and the
per-game scorers — Prompt Golf, Spot the Hallucination, Think It Through, Context
Calibration, In the Loop and the Workflow Redesign capstone).
When changing any scoring/XP/unlock behaviour, update `docs/GAME-RULES.md` and the
referenced code together so they stay in sync.

# AI connector

All AI (challenge scoring and dynamic challenge generation) routes through a
single connector at `src/lib/ai/connector.ts`, built on the Vercel AI SDK. The
provider is selectable via `AI_PROVIDER` (`anthropic` | `openai` | `bedrock`)
and falls back to a deterministic mock when no credentials are configured.
