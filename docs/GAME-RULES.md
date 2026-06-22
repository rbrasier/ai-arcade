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
Golf, Spot the Hallucination, Think It Through, Context Calibration, Trace the
Flow, In the Loop and the Workflow Redesign capstone — which warms its **two**
scenarios the same way) and must be kept in sync as games are added:

- **Preload all rounds behind the explainer.** When the intro / "how to play"
  modal is shown, every round is generated in the background, **sequentially**
  (one after the next), so starting and advancing has little or no wait. A
  round's generate request is memoised as a promise; `loadRound` just awaits the
  matching entry. Replay drops the cache and warms a fresh set. Implemented in
  `PromptGolfGame`, `HallucinationGame`, `ChainOfThoughtGame`,
  `ContextCalibrationGame`, `TraceFlowGame`, `CheckpointPlacementGame` and
  `WorkflowRedesignGame`.
- **No repeated theme within a play-through.** Each generated scenario carries a
  short `topic` label. Because the background warm-up is sequential, each round
  is told the topics already used (`avoidTopics`) so it picks a clearly
  different subject — no two "survey results" rounds back to back. The client
  accumulates topics in a ref; the generate routes forward them to the AI
  prompt. Applies to all of the games above (`generatePromptGolfRound`,
  `generateHallucinationRound`, `generateChainOfThoughtRound`,
  `generateContextCalibrationRound`, `generateTraceFlowRound`,
  `generateCheckpointPlacementRound`, `generateWorkflowRedesignRound`).
- **A sender who fits the scenario.** Every game frames its brief as a direct
  message from a colleague (`senderName` / `senderRole` / `senderInitials`). Both
  the **name and the role are dynamic to the scenario** — the generators instruct
  the model to pick a sender whose name and job title fit that round's domain and
  to vary them round to round (never a recurring stock person), and each game's
  deterministic mock bank carries its **own distinct roster** so no name recurs
  across games offline.

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

**Context Calibration** runs **5 rounds** of escalating difficulty and opens Act
Two. It teaches the practical skill of choosing **what context to give an AI** —
and the harder lesson that piling on too much or irrelevant context can
**misdirect** the model, not just that sparse context starves it. Each round's
scenario — a desk task, a precise goal, and a **tray of candidate context
snippets** — is generated live by the AI connector (with a deterministic mock
fallback). Every snippet carries a hidden `kind`: **essential** (the answer needs
it), **helpful** (relevant but optional, scored neutral), **noise** (irrelevant
clutter) or **distractor** (plausible but misleading — attaching it steers the
answer wrong). Difficulty scales the misdirection pressure: easy rounds (1–2) have
obvious noise and no/one weak distractor, while hard rounds (4–5) plant 2–3
tempting distractors so the player must **resist attaching everything** (echoing
Spot the Hallucination's "resist over-flagging"). The **harder rounds (4–5) are
framed as compiling a report/brief from a selection of candidate documents** —
each snippet is a short document description (wrong-period, wrong-scope,
superseded or never-adopted documents are the distractors) so the misdirection is
more involved than a one-line fact. The curate screen is styled like a **chat
composer**: the player attaches snippets from a compact context library onto a
**pre-filled, non-editable prompt** they're about to send. The selection is then
**executed** so the scorecard shows the deliverable it produced (the same "what it
produced" idea as Prompt Golf). Every snippet also carries a short **`reason`**
(ground truth, stripped pre-scoring) shown in the debrief, spelling out concretely
why it was essential or why attaching it was irrelevant/misleading.

Grading is fully deterministic against the stored `kind`s, on two axes:

- **completeness** = `essentialsIncluded / essentialsTotal` — the **gate**, like
  precision in Prompt Golf.
- **focus** = `1 − weightedBadIncluded / weightedBadTotal`, where bad = noise ∪
  distractor and a **distractor weighs 2× noise** (`DISTRACTOR_WEIGHT = 2`,
  `NOISE_WEIGHT = 1`) so misdirection bites hardest. This is the **mastery** axis,
  like economy.

`scoreRatio = 0.5 × completeness + 0.5 × focus`, **capped at `GATE_CAP = 0.5`** if
any essential is missing, and `score = round(scoreRatio × maxScore)`. So leaving
out an essential caps the round below the 65% clear, **and** attaching every bad
snippet drives focus to 0 → `0.5` → also a fail: over-inclusion is a real failure
mode, not just a missed bonus. Keeping the essentials with one distractor still
attached lands around **83%**. The ≥ 70% / ≥ 85% XP bonus tiers apply to this
ratio, and a round is `exceptional` only when **every** essential is attached and
**no** noise or distractor is. Implemented in
`src/app/api/games/context-calibration/score/route.ts`, the shared pure helpers in
`src/lib/context-calibration-scoring.ts`, and `src/lib/ai/context-calibration.ts`.

**Trace the Flow** (slug `trace-the-flow`) runs **5 rounds** of escalating
*shape* complexity and opens Act Three (Seeing Work as a System). It is the
**literacy floor**: you can only redesign work you can first **see** as a chain
of discrete steps and the data flowing between them. Each round is a messy,
real-world hand-off from a colleague (the brief). The player is given the
workflow's steps as a **shuffled tray**, each carrying a short **input** ("needs")
and **output** ("produces"), and must **reconstruct the chain in order** (tap to
place, reorder, remove) and **flag the broken hand-offs** — a boundary where a
step's input doesn't match the previous step's output. The rounds are **framed by
shape tier** — round 1 a clean straight line, round 2 a hand-off that **loses**
information, round 3 one that **reformats** it (subtler), round 4 a **parallel
branch**, round 5 a **loop-back** (a rework loop) — the tier→shape mapping, copy
and generator guidance live in `src/lib/trace-flow-tiers.ts`. The shape is told to
the player (it teaches the shape exists); *which* steps form it is ground truth.
Each step's true `position`, any `parallelGroup`, the broken hand-offs and the
loop-back are stored server-side and stripped before the tray is served (ids are
**decoupled from position** by a shuffle so they leak no order).

Grading is fully deterministic against the stored truth, on two axes:

- **sequence** = `correctlyPlaced / total` — the **gate**, like completeness in
  Context Calibration. A parallel-group member counts correct anywhere within its
  group's positions (either internal order is accepted). `scoreRatio` is **capped
  at `GATE_CAP = 0.5`** (below the 65% clear) when `sequence < 1` — you must
  reconstruct the chain to pass.
- **diagnosis** = `correctJudgments / totalJudgments` — the **mastery** axis,
  **symmetric** like In the Loop. It folds three ground-truth judgment types: the
  **broken hand-offs** flagged (a directed `fromId→toId` adjacency in the player's
  order), the **parallel branch** recognised (round 4), and the **loop-back**
  identified (round 5). `totalJudgments = brokenTotal + structuralItems +
  falseFlags`, so **missing a broken hand-off AND raising a false flag both cost**
  (the recurring "resist over-flagging" lesson). When a round has no flaws/shapes
  (round 1) leaving everything unflagged scores `diagnosis = 1`.

`scoreRatio = 0.5 × sequence + 0.5 × diagnosis`, capped at `GATE_CAP` if
`sequence < 1`, and `score = round(scoreRatio × maxScore)`. So a single
misplacement caps the round below the 65% clear (just as a missing essential gates
Context Calibration), and over-flagging a sound hand-off drags diagnosis down. The
≥ 70% / ≥ 85% XP bonus tiers apply to this ratio, and a round is `exceptional` only
when **every** step is correctly placed **and** every hand-off/shape call is
right. The reconstructed flow is then **narrated** once so the scorecard shows
what it produced — a broken hand-off's downstream mess, or a clean run — the same
illustrative "what it produced" idea as Prompt Golf, and it **never affects the
score**. Implemented in `src/app/api/games/trace-the-flow/score/route.ts`, the
shared pure helpers in `src/lib/trace-flow-scoring.ts`, and
`src/lib/ai/trace-flow.ts`.

**In the Loop** (slug `checkpoint-placement`) runs **5 rounds** of escalating
risk and opens Act Four (Safe Delegation & Human-in-the-Loop Design). It teaches
**where a human must stay in the loop** of an AI-redesigned workflow — and that
this cuts both ways: too few checkpoints lets an irreversible bad call slip
through (**liability**), while too many throw away the speed the redesign was for
(**killing efficiency**). Each round's scenario — a colleague's hand-off and an
ordered **pipeline of workflow steps** the AI runs on its own — is generated live
by the AI connector (with a deterministic mock fallback). Every step carries a
plain-English **impact** line (is it reversible? who does it reach?) so a
non-technical player can judge risk from what they read, and a hidden `kind`:
**critical** (a human must review — irreversible or affects a person), **optional**
(a reasonable judgment call, scored neutral), **safe** (plainly fine to automate)
or **trap** (sounds high-stakes but its impact line reveals it's reversible/
internal — checkpointing it just adds drag). The rounds are **framed by risk
tier** — round 1 **Low**, rounds 2–3 **Medium**, rounds 4–5 **High** — which
scales how many critical steps and tempting traps appear (the tier→shape mapping
and copy live in `src/lib/checkpoint-tiers.ts`). The player ticks the steps that
need a human, then the workflow is **simulated once** so the scorecard shows what
their oversight produced (the same "what it produced" idea as Prompt Golf).

Grading is fully deterministic against the stored step `kind`s, on two **symmetric**
axes (the two failure modes are equally real, so this mirrors Context
Calibration's split rather than a gate-heavy one):

- **coverage** = `criticalCheckpointed / criticalTotal` — the **gate**, like
  completeness in Context Calibration.
- **efficiency** = `1 − weightedOverCheckpointed / weightedSafeTotal`, where a
  **trap weighs 2× a plainly-safe step** (`TRAP_WEIGHT = 2`, `SAFE_WEIGHT = 1`) so
  over-cautious checkpointing bites hardest. This is the **mastery** axis.

`scoreRatio = 0.5 × coverage + 0.5 × efficiency`, **capped at `GATE_CAP = 0.5`** if
any critical step is left unguarded, and `score = round(scoreRatio × maxScore)`. So
leaving a critical step unguarded caps the round below the 65% clear (liability),
**and** checkpointing every safe step drives efficiency to 0 → `0.5` → also a fail
(over-checkpointing is a real failure mode). Guarding the criticals with one
needless checkpoint still clears comfortably. The ≥ 70% / ≥ 85% XP bonus tiers
apply to this ratio, and a round is `exceptional` only when **every** critical step
is guarded and **no** safe or trap step is. Implemented in
`src/app/api/games/checkpoint-placement/score/route.ts`, the shared pure helpers in
`src/lib/checkpoint-placement-scoring.ts`, and `src/lib/ai/checkpoint-placement.ts`.

_Consequences (feedback only — never scored)._ When the player runs the workflow,
the debrief shows the **same workflow played out three ways** — **manual only**
(every step by a human), **your design** (the AI runs it with the player's
checkpoints), and **AI only** (fully unattended) — projected across a quarter in a
**5,000-person organisation**. Each step carries a numeric `manualMinutes` and each
scenario a `volumePerQuarter`; `computeOrgImpact` (in `src/lib/checkpoint-impact.ts`)
estimates, per approach, the **workflows processed**, **total + average time**,
**processing errors** (humans slip at a flat rate; an AI is reliable on routine
steps but more error-prone on high-judgement ones — a checkpoint catches most of a
step's slips at the cost of review time), **high-level consequences** (an uncaught
error on a critical, irreversible/person-affecting step) and a single **net cost**
that folds time, rework and consequences into equivalent hours. The payoff falls
out of the model: all-manual is safe-ish but enormously slow, all-AI is fast but
lets serious errors through, and the **calibrated middle wins on net** — unless the
player left a critical unguarded (their column collapses toward all-AI) or
over-checkpointed (their time balloons). It is the same illustrative "what it
produced" layer as the capstone's consequences read and **never affects the score**.

**Workflow Redesign Challenge** (slug `workflow-redesign`) is the **Act Five
capstone**. Unlike the five escalating-difficulty games it is **not** a 5-round
game: it runs the **2 seeded scenarios** (HR onboarding, expense review) as deep
challenges, each played through a **four-phase loop** — **Setup** (read the as-is
workflow and its bottlenecks), **Ideation** (free-text analysis the AI synthesises
into insights — formative and **unscored**, via
`src/app/api/games/workflow-redesign/ideate/route.ts`), **Build** (a drag-and-drop
canvas — `@dnd-kit/core` — where the player drags a **capability block**
(`summarise` / `classify` / `extract` / `flag` / `draft`) onto each stage, picks an
**implementation tier** (`rules` / `llm` / `custom-app`) and toggles a **human
checkpoint**) and **Validate** (an AI **technical + governance critique** of the
finished design — illustrative narration that **never affects the score**, the same
"what it produced" idea as Prompt Golf).

The canvas is organised as **one slot per as-is stage** so the free-feeling build
still maps 1:1 to stored ground truth. Grading is fully deterministic against each
stage's hidden `bestCapability` / `acceptableCapabilities`, `bestImpl` /
`acceptableImpls` and governance `checkpointKind` (`critical` / `trap` / `safe` /
`optional`), on **three axes** — one per decision the player makes per stage:

- **redesign** = mean capability fit (a stage scores `CAP_BEST = 1` for the best
  capability, `CAP_ACCEPTABLE = 0.7` for another acceptable one, 0 otherwise) — the
  **gate**, like completeness in Context Calibration.
- **governance** = `0.5 × coverage + 0.5 × efficiency` (reusing In the Loop's
  symmetric shape): `coverage = criticalCheckpointed / criticalTotal`, and
  `efficiency = 1 − weightedOverCheckpointed / weightedNonCriticalTotal` with a
  **trap weighing 2× a plainly-safe step** (`TRAP_WEIGHT = 2`, `SAFE_WEIGHT = 1`).
- **buildJudgment** = mean implementation-tier fit (`IMPL_BEST = 1`,
  `IMPL_ACCEPTABLE = 0.5`, else 0) — the "**appropriate use of custom build
  options**" mastery axis: both **over-engineering** (a custom app where rules/LLM
  suffice) and **under-powering** (rules on a nuanced judgement) cost.

`scoreRatio = 0.45 × redesign + 0.30 × governance + 0.25 × buildJudgment`. The
capstone inherits **both** gates of the games it unifies: it is **capped at
`GATE_CAP = 0.5`** (below the 65% clear) if **any** bottleneck is left unaddressed
(no acceptable capability) **or** **any** governance-critical stage is left
unguarded. Worked examples: a perfect redesign (best capability + best impl
everywhere, checkpoints exactly right) → **100%** (`exceptional`); every bottleneck
addressed with the best capability but impls merely acceptable, criticals guarded
plus one needless checkpoint → **~83%** (clears, bonus); an unaddressed bottleneck
**or** an unguarded critical → capped **50%** (fails). Over-gating the reversible
steps drives `efficiency` toward 0 and costs the `exceptional` rating and a chunk of
score, while the design-quality axes (capability + build = 70% of the weight) reward
a sound, fully-safe redesign — so missing a bottleneck or an irreversible checkpoint
is the true failure, not over-caution. The ≥ 70% / ≥ 85% XP bonus tiers apply to this
ratio, and a round is `exceptional` only when **every** stage has the best capability
and best implementation **and** every critical is guarded with **no** needless gate.
Implemented in `src/app/api/games/workflow-redesign/score/route.ts`, the shared pure
helpers in `src/lib/workflow-redesign-scoring.ts` (with palette copy in
`src/lib/workflow-redesign-blocks.ts`), and `src/lib/ai/workflow-redesign.ts`.

_Consequences (feedback only — never scored)._ On top of the three scoring axes,
the debrief shows a deterministic **Consequences** read so the player feels what
their choices did, in plain **speed** and **quality** terms — honouring the
learning-outcomes note that good redesign is "not just time saved". Each stage
carries a numeric `manualMinutes` (the human time today, behind the `timeCost`
string) and the scenario a `volumePerMonth`. `computeWorkflowImpact` (in
`src/lib/workflow-redesign-scoring.ts`) derives the redesigned per-item cycle time:
an automated stage takes `manualMinutes × IMPL_SPEED_FACTOR` (rules `0.05`, llm
`0.12`, custom-app `0.04`, floored at `AUTOMATION_FLOOR_MIN = 0.5` min), and a
human checkpoint **adds review time back** (`max(CHECKPOINT_REVIEW_MIN = 2,
manualMinutes × CHECKPOINT_REVIEW_FRACTION = 0.25)`) — so **over-gating visibly
costs speed**. It reports before→after cycle time, **% faster**, and
**hours saved/month** at volume, plus a per-stage quality band (`sound` /
`unaddressed` / `under-powered` / `hallucination-exposed` / `over-built`) and a
one-line verdict. The Build phase shows a **live, speed-only** estimate (via
`computeSpeed`, which uses only `manualMinutes` and leaks no ground truth); the
quality read waits for the debrief. An AI **run-narration**
(`generateWorkflowRedesignOutcome`, fed the computed metrics so prose and numbers
agree) tells the "what happened when it went live" story. None of this touches the
score — it is the same illustrative "what it produced" layer as the Validate
critique.
