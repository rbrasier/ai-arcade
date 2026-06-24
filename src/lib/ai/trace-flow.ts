import { z } from "zod";

import { pickRound } from "@/lib/rounds/bank";

import { generateJson, generatePlainText, isConfigured } from "./connector";
import { mockTraceFlowRound } from "./trace-flow-mock";
import {
  tierInfoForDifficulty,
  type ShapeTier,
  type FlowShape,
} from "../trace-flow-tiers";
import type { GradedTrace } from "../trace-flow-scoring";

/**
 * "Trace the Flow" generates a fresh real-world workflow for each of the game's
 * five rounds, as a messy hand-off from a colleague. The player reconstructs the
 * work into an ordered chain of input→output step cards, spots broken hand-offs,
 * and (later rounds) recognises a parallel branch and a loop-back.
 *
 * The teaching point is the literacy floor of Act Three: you can only redesign
 * work you can first SEE as a chain of discrete steps and the data flowing
 * between them. Difficulty scales the SHAPE (clean line → broken hand-off →
 * parallel branch → loop-back) via `trace-flow-tiers.ts`.
 */

export interface FlowStep {
  id: string;
  /** Short imperative title, e.g. "Check the form against the spreadsheet". */
  title: string;
  /** What happens at this step, one sentence. */
  detail: string;
  /** What this step needs to start — its input. The hand-off clue. */
  input: string;
  /** What this step produces — its output. The hand-off clue. */
  output: string;
  /** Canonical 0-based position in the true order — ground truth, stripped pre-scoring. */
  position: number;
  /** Steps sharing a group run in parallel — ground truth, stripped pre-scoring. */
  parallelGroup?: string | null;
}

/** A broken hand-off in the true chain, by stable step id. */
export interface BrokenHandoff {
  fromId: string;
  toId: string;
  /** Debrief: why this hand-off is broken (info lost or reformatted). */
  reason: string;
}

/** The single rework loop, by stable step id. */
export interface LoopBack {
  fromId: string;
  toId: string;
  /** Debrief: what sends the work back and where. */
  reason: string;
}

export interface TraceFlowScenario {
  /** Short topic label (e.g. "expense claim", "onboarding") — keeps rounds distinct. */
  topic: string;
  /** Shape tier for this round, derived from difficulty. */
  shapeTier: ShapeTier;
  /** The structural shape (linear / parallel / loopback) — client-visible framing. */
  shape: FlowShape;
  /** Name of the workflow being traced. */
  workflowName: string;
  /** The colleague handing the work over (styled like a direct message). */
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    /** The messy, natural-language account of how the work gets done. */
    message: string;
  };
  /** One precise sentence naming what the player must reconstruct. */
  goal: string;
  /** Every step, stored in canonical (true) order. Ground truth lives on `position`. */
  steps: FlowStep[];
  /** Hand-offs that are broken in the true chain. Ground truth. */
  brokenHandoffs: BrokenHandoff[];
  /** The rework loop, on the loop-back round. Ground truth. */
  loopBack?: LoopBack | null;
  /** Debrief paragraph: the true order, the broken hand-offs, and the lesson. */
  explanation: string;
}

/** Shape the model returns: steps in TRUE order, relationships by canonical index. */
const scenarioSchema = z.object({
  topic: z.string(),
  workflowName: z.string(),
  brief: z.object({
    senderName: z.string(),
    senderRole: z.string(),
    senderInitials: z.string(),
    message: z.string(),
  }),
  goal: z.string(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        input: z.string(),
        output: z.string(),
        parallelGroup: z.string().nullable().optional(),
      }),
    )
    .min(4)
    .max(6),
  brokenHandoffs: z
    .array(
      z.object({
        fromIndex: z.number().int(),
        toIndex: z.number().int(),
        reason: z.string(),
      }),
    )
    .default([]),
  loopBackFromIndex: z.number().int().nullable().optional(),
  loopBackToIndex: z.number().int().nullable().optional(),
  loopBackReason: z.string().nullable().optional(),
  explanation: z.string(),
});

export type RawTraceFlowScenario = z.infer<typeof scenarioSchema>;

const SYSTEM_PROMPT = `You generate rounds for "Trace the Flow", the first game of an act about SEEING WORK AS A SYSTEM. The player is handed a messy, real-world account of how a task actually gets done and must rebuild it into an ordered chain of discrete steps — reading each step's INPUT (what it needs) and OUTPUT (what it produces) to work out the order, and spotting hand-offs where the data doesn't carry across cleanly. It is the literacy floor: you can't redesign work you can't first see as a chain.

You produce ONE workflow as an ORDERED list of steps in the TRUE order the work happens (index 0 is first). The player will see these steps SHUFFLED and must reorder them, so the correct order must be inferable from the inputs/outputs and the brief — never from the order you list them in.

Fields:
- "topic": a 1-3 word label for the workflow's subject (e.g. "expense claim", "new-hire setup").
- "workflowName": a short name for the workflow.
- "brief": the colleague handing the work over — a "senderName", a "senderRole" job title, two-letter "senderInitials", and a "message" that tells the story of how the task gets done in messy, natural language ("first someone emails me the form, then I check it against the sheet, and if it's over £5k I send it to Priya…"). The name AND role must FIT this workflow's domain and vary from round to round — never a recurring stock person.
- "goal": one precise sentence naming what the player must reconstruct.
- "steps": 4-6 steps in TRUE order. Each has a short "title", a one-sentence "detail" of what happens, an "input" (what the step needs to begin) and an "output" (what it produces). Chain them so each step's input matches the previous step's output — EXCEPT at any broken hand-off you plant. Keep each input/output a short concrete noun phrase.
- "brokenHandoffs": the hand-offs that are broken, each as { "fromIndex", "toIndex", "reason" } using canonical step indices (toIndex is the step that receives the broken input, normally fromIndex+1). The "reason" explains in plain language what went wrong (information lost, or reformatted into an unusable shape). Use [] when there is no broken hand-off.
- "parallelGroup": set this to the SAME short string (e.g. "pg1") on the two steps that run in parallel, only when the round calls for a parallel branch. Leave it off otherwise.
- "loopBackFromIndex" / "loopBackToIndex" / "loopBackReason": only when the round calls for a loop-back — the step that sends work back, the earlier step it returns to (toIndex < fromIndex), and a plain reason. Leave null otherwise.
- "explanation": one short paragraph for the debrief — state the true order in plain terms, name any broken hand-off and what it cost, and the lesson.

Rules:
- The correct order must be unambiguous from the inputs/outputs and the brief alone — never require outside knowledge.
- Keep workflows grounded, professional and varied across rounds (different industries/subjects), each with its own fitting sender (name + role).`;

/** Fisher-Yates shuffle (server-side; decouples step ids from their position). */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Turn the model's canonical-order raw scenario into the stored scenario: assign
 * each step a stable id whose NUMBER is decoupled from its position (so the id
 * leaks no ordering), record the canonical `position`, and resolve all
 * index-based relationships (broken hand-offs, loop-back) to ids.
 */
export function withFlow(
  raw: RawTraceFlowScenario,
  shapeTier: ShapeTier,
  shape: FlowShape,
): TraceFlowScenario {
  const n = raw.steps.length;
  // A shuffled labelling: canonical index i gets id `s${perm[i]}`.
  const labels = shuffled(Array.from({ length: n }, (_, i) => i + 1));
  const idForIndex = (i: number) => `s${labels[i]}`;

  const steps: FlowStep[] = raw.steps.map((s, i) => ({
    id: idForIndex(i),
    title: s.title,
    detail: s.detail,
    input: s.input,
    output: s.output,
    position: i,
    parallelGroup: s.parallelGroup ?? null,
  }));

  const brokenHandoffs: BrokenHandoff[] = (raw.brokenHandoffs ?? [])
    .filter(
      (b) =>
        b.fromIndex >= 0 &&
        b.fromIndex < n &&
        b.toIndex >= 0 &&
        b.toIndex < n,
    )
    .map((b) => ({
      fromId: idForIndex(b.fromIndex),
      toId: idForIndex(b.toIndex),
      reason: b.reason,
    }));

  let loopBack: LoopBack | null = null;
  if (
    typeof raw.loopBackFromIndex === "number" &&
    typeof raw.loopBackToIndex === "number" &&
    raw.loopBackFromIndex >= 0 &&
    raw.loopBackFromIndex < n &&
    raw.loopBackToIndex >= 0 &&
    raw.loopBackToIndex < n
  ) {
    loopBack = {
      fromId: idForIndex(raw.loopBackFromIndex),
      toId: idForIndex(raw.loopBackToIndex),
      reason: raw.loopBackReason ?? "Work is sent back here for another pass.",
    };
  }

  return {
    topic: raw.topic,
    shapeTier,
    shape,
    workflowName: raw.workflowName,
    brief: raw.brief,
    goal: raw.goal,
    steps,
    brokenHandoffs,
    loopBack,
    explanation: raw.explanation,
  };
}

/**
 * Generate a round at the given difficulty (1-5). Falls back to a mock bank when
 * no AI provider is configured (or on error). `opts.avoidTopics` lists topics
 * already used earlier in the play-through so the five rounds stay distinct.
 *
 * Difficulty scales the SHAPE: a clean straight line, then a broken hand-off,
 * then a parallel branch, then a loop-back — teaching that real work isn't always
 * a tidy line.
 */
export async function generateTraceFlowRound(
  difficulty: number,
  opts: { avoidTopics?: string[]; fromBank?: boolean } = {},
): Promise<TraceFlowScenario> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));

  // Prefer a pre-generated round from the static bank (see src/lib/rounds).
  if (opts.fromBank !== false) {
    const picked = pickRound<TraceFlowScenario>("trace-flow", d, {
      avoidTopics: opts.avoidTopics,
    });
    if (picked) return picked;
  }
  const tier = tierInfoForDifficulty(d);

  if (!isConfigured()) {
    return mockTraceFlowRound(d);
  }

  const avoid = (opts.avoidTopics ?? []).filter(Boolean);
  const avoidNote = avoid.length
    ? ` Do NOT reuse any of these already-used topics (pick a clearly different subject): ${avoid.join("; ")}.`
    : "";

  try {
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one "Trace the Flow" round at difficulty ${d} of 5. ${tier.guidance} Pick a fresh, recognisable workflow and set "topic" to a short label for it.${avoidNote} Make sure the true order is unambiguous from the inputs/outputs and the brief.`,
      maxOutputTokens: 1536,
    });

    return withFlow(raw, tier.tier, tier.shape);
  } catch {
    return mockTraceFlowRound(d);
  }
}

/**
 * Narrate what the reconstructed flow PRODUCED — the "what it produced" debrief
 * layer (same idea as Prompt Golf / In the Loop). When a hand-off is broken, tell
 * the concrete story of what the lost/reformatted data cost downstream;
 * otherwise say the work flowed cleanly end to end. Illustrative only — the score
 * is graded deterministically from the stored order, not this text. Falls back to
 * a deterministic stand-in when no provider is configured (or on error).
 */
export async function generateTraceFlowOutcome(args: {
  scenario: TraceFlowScenario;
  graded: GradedTrace;
}): Promise<string> {
  const { scenario, graded } = args;

  if (!isConfigured()) {
    return mockTraceFlowOutcome(scenario, graded);
  }

  const ordered = [...scenario.steps].sort((a, b) => a.position - b.position);
  const stepLines = ordered
    .map(
      (s, i) =>
        `${i + 1}. ${s.title} — needs: ${s.input}; produces: ${s.output}`,
    )
    .join("\n");
  const breakLines = scenario.brokenHandoffs
    .map((b) => `- broken hand-off: ${b.reason}`)
    .join("\n");

  try {
    return await generatePlainText({
      system:
        "You narrate what a real workflow produced once it ran end to end, to show the consequence of how information flowed between steps. In 2-4 sentences, grounded and concrete: if a hand-off was broken (information lost or reformatted), tell the plausible downstream mess it caused (a wrong figure, a missed approval, rework). If every hand-off was clean, say the work flowed through correctly and the output was sound. Do not lecture or mention scores.",
      prompt: `Workflow: ${scenario.workflowName}\nGoal: ${scenario.goal}\n\nTrue order:\n${stepLines}\n\n${breakLines || "- no broken hand-offs"}`,
      maxOutputTokens: 320,
    });
  } catch {
    return mockTraceFlowOutcome(scenario, graded);
  }
}

/** Deterministic stand-in outcome narration for the offline / mock path. */
function mockTraceFlowOutcome(
  scenario: TraceFlowScenario,
  graded: GradedTrace,
): string {
  if (graded.sequence < 1) {
    return `Run as you sequenced it, the work jammed: a step started before the thing it needed existed, so the chain couldn't actually flow end to end. Get the order right first — everything downstream depends on it.`;
  }
  if (scenario.brokenHandoffs.length > 0) {
    const b = scenario.brokenHandoffs[0];
    const caught = graded.brokenCaught > 0;
    if (caught) {
      return `You traced the chain correctly and caught the weak link: ${b.reason} Because you flagged it, the gap could be fixed before it did any damage downstream — that's exactly the hand-off that quietly breaks this kind of work.`;
    }
    return `The chain ran in the right order, but a hand-off silently failed and you didn't flag it: ${b.reason} Downstream the work carried on with the wrong information, and the error only surfaced much later — the cost of a broken hand-off no one spotted.`;
  }
  return `Clean run: every step received exactly what the one before it produced, so the work flowed straight through and the output held up. That's what a healthy chain looks like.`;
}
