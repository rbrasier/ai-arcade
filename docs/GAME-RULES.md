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

## Round generation patterns

These two patterns are **shared by every multi-round, AI-generated game** (Prompt
Golf, Spot the Hallucination and Think It Through) and must be kept in sync as
games are added:

- **Preload all rounds behind the explainer.** When the intro / "how to play"
  modal is shown, every round is generated in the background, **sequentially**
  (one after the next), so starting and advancing has little or no wait. A
  round's generate request is memoised as a promise; `loadRound` just awaits the
  matching entry. Replay drops the cache and warms a fresh set. Implemented in
  `PromptGolfGame`, `HallucinationGame` and `ChainOfThoughtGame`.
- **No repeated theme within a play-through.** Each generated scenario carries a
  short `topic` label. Because the background warm-up is sequential, each round
  is told the topics already used (`avoidTopics`) so it picks a clearly
  different subject — no two "survey results" rounds back to back. The client
  accumulates topics in a ref; the generate routes forward them to the AI
  prompt. Applies to all three games above (`generatePromptGolfRound`,
  `generateHallucinationRound`, `generateChainOfThoughtRound`).

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
never re-awards XP. The course itself shows **no** completion toast — reaching
the last slide simply marks it complete; whenever any game transitions out of
`locked`, the arcade home page is what surfaces a prominent bottom toast for ~5s
(`UnlockToast`, no button).

**Spot the Hallucination** runs **5 rounds** of escalating difficulty. Each
round's scenario is generated live by the AI connector.

The rounds are **framed by model tier** to teach an accurate mental model rather
than "AI lies all the time": round 1 is a small/**Quick** model, rounds 2–3 a
**Mid** model, and rounds 4–5 a **Frontier** model — mirroring the AI Foundations
course (Slide 7). Fabrication frequency falls as the tier rises: the quick model
plants 2–3 blatant fabrications, the mid models 1–2 subtler ones, and the
frontier model 0–1 very subtle ones (**often zero** — a sound answer is a valid
round, and the player must resist over-flagging). The tier→difficulty mapping and
copy live in `src/lib/hallucination-tiers.ts`; the generator scales fabrication
count/obviousness with the tier, and every fabrication must leave a catchable
clue (a wrong name, an invented number, an uncited source, or a line clashing
with the reasoning).

Each claim gets a **three-state verdict**: the player clicks a claim to cycle it
**flag** (fabricated) → **verify** (sound) → unmarked. Scoring credits each
claim toward **accuracy** on a gradient:

- a **correct** verdict (flag a fabrication / verify a sound claim) → **1**
- a **sound** claim left **unmarked** (no commitment, no penalty) → **0.5**
- a **fabrication** left **unmarked** (you let it slip) → **0.25**
- a **wrong** verdict (flag a sound claim, or *vouch for* a fabrication) → **0**

`accuracy = creditSum / claims`, `score = round(accuracy × maxScore)`. So leaving
everything unmarked scores **at most 50%** — and less when there are fabrications
you failed to catch — always below the 65% clear. The gradient is monotonic:
catching beats not bothering, not bothering on a sound claim beats letting a
fabrication slip, and both beat an actively wrong call. A false flag costs you
versus leaving the claim alone (a disincentive to over-flag), and **missing a
fabrication bites** versus leaving a sound claim alone. ≥ 65% accuracy clears,
≥ 70% / ≥ 85% earn the XP bonus tiers above, and a round is `exceptional` only
when **every** claim is correctly classified. Implemented in
`src/app/api/games/hallucination/score/route.ts` and
`src/lib/ai/hallucination.ts`.

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

**Think It Through** runs **5 rounds** of escalating difficulty and sits between
Act One and Act Two. It teaches the mindset shift that AI can now **reason
through** multi-step work people used to do by hand — so the human's job moves to
**directing and verifying** the reasoning. Each round's scenario — a multi-step
desk task, a confident **snap answer** from a quick (non-reasoning) model, a
step-by-step **chain of thought**, and the answer options — is generated live by
the AI connector (with a deterministic mock fallback). Difficulty scales the snap
answer's correctness: on **easy rounds (1–2)** the snap answer is **right** (a
simple task doesn't need deep working), while on **harder rounds (3–5)** it is
**wrong** — it skips a step and falls for a plausible trap, and only the chain of
thought reaches the correct option.

The player makes **two calls** per round, scored on two binary axes:

- **accuracy** ∈ {0, 1} — did they commit the **correct final option**. This is
  the **gate**, like precision in Prompt Golf.
- **judgment** ∈ {0, 1} — was the **trust call** right: `trusted === snapCorrect`
  (trust the snap only when it was actually right; demand the working only when it
  wasn't). This is the **mastery** axis, like economy.

`scoreRatio = 0.65 × accuracy + 0.35 × judgment`, `score = round(scoreRatio ×
maxScore)`. So a correct final answer alone scores **65%** (a clear, no bonus); a
correct trust call on top lifts it into the XP-bonus tiers, and **both** correct
is a perfect **100%**. A wrong final answer caps the round at **35%** — below the
65% clear — so the answer gates the round just as precision does in Prompt Golf.
A round is `exceptional` only when **both** the answer and the trust call are
correct. Grading is fully deterministic against stored ground truth (no AI judge
at score time). Implemented in
`src/app/api/games/chain-of-thought/score/route.ts`, the shared pure helpers in
`src/lib/chain-of-thought-scoring.ts`, and `src/lib/ai/chain-of-thought.ts`.
