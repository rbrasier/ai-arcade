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

### Mini-Games

**Prompt Golf** — Given a real corporate scenario and a checklist of criteria, write the shortest prompt that makes an AI hit every requirement without losing intent. Five rounds of escalating difficulty; one is a "rewrite" round where the player trims a bloated draft prompt down to size. Scored on precision (criteria coverage) and word economy (vs par).

**Spot the Hallucination** — Review AI-generated passages and flag fabricated claims. Scored on accuracy.

**Think It Through** — A bridge into the next act. A quick (non-reasoning) model blurts a confident answer to a realistic multi-step desk task — the kind of job people used to grind out by hand. The player decides whether to trust that snap answer or make the AI **reason it out step by step**, watches the chain of thought unfold, then commits the final answer. The lesson is the mindset shift: AI can now reason through multi-step work, so the human's job moves from *doing the steps* to *directing and verifying the reasoning*. Five rounds of escalating difficulty; easy rounds have a sound snap answer (don't over-demand working), harder rounds bait the snap answer with a trap only the reasoning avoids. Scored on the final answer (the gate) plus the trust call.

### Learning Outcomes

- Recognise that AI can reason through multi-step work that used to be manual
- Calibrate when a quick answer is enough vs when to demand the working
- Read a chain of thought and stay accountable for the final decision

---

## Act Two: Context Mastery

### Learning Outcomes

- Understand how context shapes output quality
- Recognise where context is too sparse, too noisy, or missing entirely

### Mini-Game

**Context Calibration** — Compose prompts with variable context windows. See how output quality shifts. Mini-challenges include "fix this hallucination by adding one contextual detail" and "remove two noisy sentences and improve the output."

---

## Act Three: Safe Delegation & Human-in-the-Loop Design

### Learning Outcomes

- Identify where AI can own a decision and where humans must remain accountable
- Design workflows that balance speed with appropriate human oversight
- Calibrate checkpoint placement without killing efficiency gains

### Mini-Game

**Checkpoint Placement** — Given a pre-built redesigned workflow, players place human review checkpoints at the right moments. Scenarios escalate in risk:

| Risk Level | Scenario |
|------------|----------|
| Low | Auto-summarise meeting notes |
| Medium | Flag policy violations in submissions |
| High | Recommend staffing decisions from performance data |

Too many checkpoints kills efficiency. Too few creates liability. Scoring rewards calibration.

---

## Act Four: Workflow Redesign & The Art of the Possible

### Learning Outcomes

- Redesign work processes around AI's strengths rather than just accelerating existing tasks
- Understand technical implementation options within each workflow step
- Know when to engage IT specialists to commission custom applications that radically uplift capability

### Mini-Game: Workflow Redesign Challenge

Four-phase interactive loop:

1. **Setup** — AI dynamically generates a realistic, recognisable corporate workflow scenario (e.g., HR onboarding, expense review, policy drafting). Player sees current state: bottlenecks, manual steps, time cost.

2. **Ideation** — Freeform prompt box. Player analyses the workflow in natural language: "What are the bottlenecks? Where could AI add value?" AI synthesises their thinking into structured insights.

3. **Build** — Drag-and-drop canvas. Player redesigns the workflow using AI capability blocks (summarise, classify, extract, flag, human review checkpoint). Each block has a drill-down showing implementation options:
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
| Act Three | "I know where humans must stay in the loop" |
| Act Four | "I can redesign work itself — and know when to call in specialists" |
