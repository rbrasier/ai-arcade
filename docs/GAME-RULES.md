# Common Game Rules

These rules are **shared by every game** in the AI Arcade. They are not just
documentation — they are wired into the code, so changing a number here means
changing it in the referenced file too.

## Scoring

- Every challenge is scored out of its `maxScore` (default **100**).
- A challenge's **score ratio** = `score / maxScore`.

## XP

Players earn XP for every attempt, plus a bonus for strong performance:

| Score ratio | Base XP                     | Bonus XP                  |
| ----------- | --------------------------- | ------------------------- |
| any         | `round(xpReward × ratio)`   | —                         |
| **≥ 70%**   | as above                    | **+25%** of `xpReward`    |
| **≥ 85%**   | as above                    | **+50%** of `xpReward`    |

- Below 70% there is no bonus.
- Implemented by `bonusForScoreRatio()` in `src/lib/xp.ts`, applied in
  `src/app/api/attempts/route.ts` and the Spot the Hallucination scorer
  (`src/app/api/games/hallucination/score/route.ts`).

## Clearing & unlocking

- A challenge is **cleared** at a score ratio of **≥ 65%**.
- Clearing challenges is what unlocks progression: the arcade always keeps the
  next games available as you clear your way forward.
- Implemented by `CLEAR_THRESHOLD = 0.65` in `src/lib/progress.ts`.

## Duration

- Each game targets roughly **15 minutes** of play (`estMinutes: 15` in
  `src/lib/db/seed.ts`).

## Levels

- Total XP maps to a level via a gently increasing curve
  (`xpToAdvanceFromLevel` in `src/lib/xp.ts`): level _n_ → _n+1_ costs
  `100 + (n − 1) × 50` XP.

---

### Per-game notes

**Spot the Hallucination** runs **5 rounds** of escalating difficulty. Each
round's scenario is generated live by the AI connector. Round score is the
player's **accuracy** — the share of claims correctly judged (fabricated claims
flagged, sound claims left alone) — mapped onto `maxScore`. So ≥ 65% accuracy
clears the round, ≥ 70% / ≥ 85% earn the XP bonus tiers above.
