# AI Upskilling Game — Learning Arc & Structure

**Target audience:** Staff with basic AI familiarity (10–20 casual chatbot uses). No technical background assumed.

**Overall goal:** Move from "AI makes my work faster" to "I can fundamentally redesign how I work using AI."

---

## Act Zero: Orientation

### Learning Outcomes

- Build a correct mental model of what an LLM is doing (next-token prediction)
- Recognise tokens, hallucinations, the role of context, iteration, model tiers,
  and where the human stays accountable

### Course

**AI Foundations** — A short, self-paced interactive course that runs before the
first game. Eight hands-on slides cover how AI predicts text, tokens,
hallucinations, context, the prompt pattern, iteration, models/frontier models,
and human ownership. It is not graded: reaching the end completes it at 100%,
which unlocks Spot the Hallucination.

---

## Act One: Prompt Mastery & Safety Foundations

### Learning Outcomes

- Write tight, effective, unambiguous prompts
- Detect hallucinations and fabricated claims in AI output
- Recognise that AI can reason through multi-step work that used to be manual
- Calibrate when a quick answer is enough vs when to demand the working
- Read a chain of thought and stay accountable for the final decision

### Mini-Games

**Prompt Golf** — Given a real corporate scenario and a checklist of criteria, write the shortest prompt that makes an AI hit every requirement without losing intent. Five rounds of escalating difficulty; one is a "rewrite" round where the player trims a bloated draft prompt down to size. Scored on precision (criteria coverage) and word economy (vs par).

**Spot the Hallucination** — Review an AI work assistant's answer and flag the fabricated claims. Five rounds framed by model tier (Quick → Mid → Frontier), with fabrications growing rarer and subtler as the tier rises — so a sound answer is a valid round and the player must resist over-flagging. Each claim is a three-state verdict (flag / verify / unmarked), scored on accuracy.

**Think It Through** — A bridge into the next act. A quick (non-reasoning) model blurts a confident answer to a realistic multi-step desk task — the kind of job people used to grind out by hand. The player decides whether to trust that snap answer or make the AI **reason it out step by step**, watches the chain of thought unfold, then commits the final answer. The lesson is the mindset shift: AI can now reason through multi-step work, so the human's job moves from *doing the steps* to *directing and verifying the reasoning*. Five rounds of escalating difficulty; easy rounds have a sound snap answer (don't over-demand working), harder rounds bait the snap answer with a trap only the reasoning avoids. Scored on the final answer (the gate) plus the trust call.

---

## Act Two: Context Mastery

### Learning Outcomes

- Choose the context that actually improves an answer
- Recognise that excess or irrelevant context can *misdirect* the model — not just that sparse context starves it
- Calibrate: enough signal to ground the answer, no noise to derail it

### Mini-Game

**Context Calibration** — Each round, a colleague forwards a realistic desk task and a **tray of candidate context snippets**. The player curates which snippets to attach to the prompt, then sees the deliverable the AI produces from that selection. The tray mixes snippets the answer genuinely needs (*essential*), harmless clutter (*noise*) and — crucially — plausible-but-misleading **distractors** that steer the answer wrong if attached. The lesson is calibration over volume: too little context starves the answer, too much misdirects it. Five rounds of escalating difficulty — early rounds have obvious noise and no traps, later rounds plant several tempting distractors so the player must resist piling everything in. Scored on **completeness** (did you attach the essentials — the gate) and **focus** (did you leave out the noise and distractors — with misleading snippets penalised hardest).

---

## Act Three: Seeing Work as a System

Act Three is the bridge from *talking to AI* (Acts One–Two) to *redesigning
work with AI* (Acts Four–Five). It builds the underlying system-thinking the
later acts assume, in a clean causal chain: **see the steps → make sure good
data flows through them → decide which steps are worth changing, and how.**

### Learning Outcomes

- Decompose fuzzy, "I just do my job" work into discrete, namable steps — each
  with an input and an output — and spot where a hand-off loses information
- Recognise that AI quality is bounded by *input* quality: most "the AI is dumb"
  failures are data problems (missing context, inconsistent formats, stale or
  wrong-category source) — the input-hygiene counterpart to Spot the
  Hallucination's output vigilance
- Match a step's characteristics (volume, variability, risk, structure) to the
  right intervention — manual, rules-based, LLM, or a custom app — and weigh the
  cost of intervening *and* of not intervening, so "leave it manual" is a real,
  sometimes-correct answer (the antidote to AI-solutionism)

### Mini-Games

**Trace the Flow** *(What a workflow is — the literacy floor)* — The player is
given a messy, realistic narrative of how a task actually gets done ("first
someone emails the form, then I check it against the spreadsheet, then if it's
over $5k I forward it to Priya…") and reconstructs it into an ordered chain of
discrete step cards, each tagged with its **input** and **output**. The core
mechanic is tap-to-place ordering, plus spotting a **broken link** — a hand-off
where one step's input doesn't match the previous step's output (information
lost or reformatted). Later rounds introduce non-linear shapes: a hidden
**parallel branch** and a **loop-back** ("if rejected, return to step 2"),
teaching that real workflows aren't always a straight line. This comes first
because every later game assumes the learner can already see work as a chain —
you can't redesign what you can't see.

_Learning outcomes:_ break opaque work into discrete input→output steps; name
each step; detect broken hand-offs; recognise parallel branches and loop-backs.

**Clean the Pipe** *(Data management — input hygiene)* — The mirror of Spot the
Hallucination, on the **input** side. The player is about to run an AI step (e.g.
"summarise these customer complaints into themes") and is shown the data going
in — and it's dirty: inconsistent date formats, a half-empty row, duplicates, a
stale 2019 record, one entry that's actually a different category entirely. The
player triages the inputs *before* pressing run, then sees two outputs side by
side: what the AI produced from the **raw** data versus the **cleaned** data —
the contrast is the lesson. Scored on catching the **consequential** problems
(a duplicate barely matters; the wrong-category record poisons the whole
summary), so it teaches that **not all dirt is equal** and heads off the
over-correction of obsessive cleaning. Pairs deliberately with Spot the
Hallucination: output vigilance and input hygiene are the two halves of trusting
AI work.

_Learning outcomes:_ recognise garbage-in-garbage-out as a data problem, not an
AI problem; triage which input flaws actually change the output; calibrate
cleaning effort to consequence rather than tidiness.

**Right Tool for the Job** *(Tool choice + intervention cost — fused)* — Each
round presents a single workflow step with revealed characteristics — **volume**
(12 times a year vs 4,000 times a day), **variability** (identical every time vs
every case different), **risk** (a typo vs legal exposure) and **structure**
(clean form fields vs free text). The player picks an intervention: **leave
manual**, **rules-based automation**, **LLM**, or **commission a custom app**.
The round then charges them — each choice surfaces a **build cost**, **ongoing
maintenance**, and a simulated **failure cost** over a year, against the **drag
cost** of doing nothing. Some rounds are rigged so the "exciting" answer (build a
custom AI app!) is **wrong** because the volume can never pay back the build, and
the rewarded answer is "leave it manual"; others punish **under-intervening** — a
high-volume, high-drag step left alone bleeds cost all year. Scoring is **net
value, not sophistication.** This is a standalone, generalised version of the
Act Five Build drill-down — it pre-teaches the exact judgment the Workflow
Redesign Challenge later asks players to apply in context.

_Learning outcomes:_ match the intervention to a step's volume / variability /
risk / structure; account for build, maintenance and failure costs against the
cost of inaction; resist AI-solutionism — recognise when "leave it manual" is
the correct call.

| Order | Game | Concept | Why here |
|-------|------|---------|----------|
| 1 | **Trace the Flow** | What a workflow is | Literacy floor — must come first |
| 2 | **Clean the Pipe** | Data management | Inputs feed the workflow you just learned to see |
| 3 | **Right Tool for the Job** | Tool choice + intervention cost | Now you can see steps and judge what to do with each |

---

## Act Four: Safe Delegation & Human-in-the-Loop Design

### Learning Outcomes

- Identify where AI can own a decision and where humans must remain accountable
- Design workflows that balance speed with appropriate human oversight
- Calibrate checkpoint placement without killing efficiency gains

### Mini-Game

**In the Loop** (Checkpoint Placement) — Given a pre-built redesigned workflow that an AI runs on its own, players place human-review checkpoints at the right moments. Five rounds of escalating risk; each step carries a plain-English impact line, and the workflow is simulated once so players see what their oversight produced. Scenarios escalate in risk:

| Risk Level | Scenario |
|------------|----------|
| Low | Auto-summarise meeting notes |
| Medium | Flag policy violations in submissions |
| High | Recommend staffing decisions from performance data |

Too many checkpoints kills efficiency. Too few creates liability. Scoring rewards calibration.

---

## Act Five: Workflow Redesign & The Art of the Possible

### Learning Outcomes

- Redesign work processes around AI's strengths rather than just accelerating existing tasks
- Understand technical implementation options within each workflow step
- Know when to engage IT specialists to commission custom applications that radically uplift capability

### Mini-Game: Workflow Redesign Challenge

Four-phase interactive loop:

1. **Setup** — AI dynamically generates a realistic, recognisable corporate workflow scenario (e.g., HR onboarding, expense review, policy drafting). Player sees current state: bottlenecks, manual steps, time cost.

2. **Ideation** — Freeform prompt box. Player analyses the workflow in natural language: "What are the bottlenecks? Where could AI add value?" AI synthesises their thinking into structured insights.

3. **Build** — Drag-and-drop canvas (one slot per as-is stage). Player redesigns the workflow by dragging an AI capability block (summarise, classify, extract, flag, draft) onto each stage, picking an implementation tier, and toggling a human-review checkpoint. The implementation tiers are:
   - Rules-based filter (fast, limited)
   - LLM classification (nuanced, hallucination risk)
   - Custom Application (IT-built, tailored, highest capability and speed)

4. **Validate** — AI runs over their completed design and critiques it across two dimensions:
   - **Technical:** error rates, hallucination risks, confidence scoring gaps
   - **Governance:** missing human checkpoints, defensibility of automated decisions

**Scoring:** Not just time saved — quality improvement, risk management, and appropriate use of custom build options all count.

---

## Overall Learning Progression

| Stage | Mindset Shift |
|-------|---------------|
| Act One | "I can communicate with AI precisely and safely" |
| Act Two | "I understand why AI behaves the way it does" |
| Act Three | "I can see my work as a system of steps, data and choices" |
| Act Four | "I know where humans must stay in the loop" |
| Act Five | "I can redesign work itself — and know when to call in specialists" |
