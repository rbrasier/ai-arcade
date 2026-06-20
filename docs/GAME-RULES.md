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

**AI Foundations** is the introductory course that runs **before the first
game**. It is **not** AI-scored: it has a single challenge and simply reaching
the end of its eight interactive slides completes it at **100%**, awarded
deterministically by `src/app/api/games/foundations/complete/route.ts` (which
still applies the common XP-bonus rule — a perfect ratio earns the top tier).
Because 100% clears the challenge (≥ 65%), completing the course marks the game
`completed` and, via the standard unlock rule above, unlocks **Spot the
Hallucination**. The completion call is idempotent, so replaying the course
never re-awards XP. Whenever any game transitions out of `locked`, the arcade
home page surfaces a prominent bottom toast for ~5s (`UnlockToast`).

**Spot the Hallucination** runs **5 rounds** of escalating difficulty. Each
round's scenario is generated live by the AI connector. Round score is the
player's **accuracy** — the share of claims correctly judged (fabricated claims
flagged, sound claims left alone) — mapped onto `maxScore`. So ≥ 65% accuracy
clears the round, ≥ 70% / ≥ 85% earn the XP bonus tiers above.

**Prompt Golf** runs **5 rounds** of escalating difficulty. Each round's
scenario — a corporate brief, the criteria the prompt must satisfy, and a **par**
word count — is generated live by the AI connector (with a deterministic mock
fallback). The player writes the shortest prompt that meets every criterion, and
the round score combines two factors:

- **precision** = `criteriaMet / criteriaTotal` (judged by the AI connector, or
  a keyword heuristic in the mock).
- **economy** is anchored on the **ace** — the fewest words that can still cover
  every criterion, `ace = max(2, round(par × 0.5))`. It is `1` at or below the
  ace, decreases linearly to `PAR_ECONOMY = 0.5` at par, and continues linearly
  to `0` at twice par. So landing on par is a solid clear, **not** a top score.
  Beyond twice par economy keeps falling — at **double the slope**, into the
  negatives — floored at `MIN_ECONOMY = -1.5`. This is deliberately harsh on
  blown-up word counts ("over double bogey"): because economy can go negative it
  drags the score *below* the precision-only ceiling, so pasting a long-winded
  draft unchanged fails rather than coasting on precision. A perfect-precision
  prompt at ~3× par drops under **35**, flooring near **25**. Word counts over
  twice par are surfaced as a **Blow-up** golf grade.

On submission the prompt is also **executed** so the scorecard shows the prompt
and the deliverable it produced side by side.

`scoreRatio = 0.7 × precision + 0.3 × economy`, and `score = round(scoreRatio ×
maxScore)`. Precision is the gate: a brief but off-target prompt can't reach the
65% clear threshold. A perfect-precision prompt sitting on par scores **85%** —
reaching 100% means trimming all the way to the ace, which is meant to feel like
a hole-in-one. Word counts are also surfaced as **golf grades** — under par
(birdie → eagle → albatross → hole-in-one) and over par (bogey → double bogey →
blow-up) — each covering a *range* of words since pars are large. The ≥ 70% / ≥ 85% XP bonus tiers above apply to this
ratio, and a round is `exceptional` only when precision is perfect **and** the
prompt is trimmed to the ace. Implemented in
`src/app/api/games/prompt-golf/score/route.ts`, the shared pure helpers in
`src/lib/prompt-golf-scoring.ts`, and `src/lib/ai/prompt-golf.ts`.
