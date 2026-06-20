import { z } from "zod";

import { generateJson, generatePlainText, isConfigured } from "./connector";
import { mockCheckpointPlacementRound } from "./checkpoint-placement-mock";
import { tierInfoForDifficulty, type RiskTier } from "../checkpoint-tiers";
import type { StepKind } from "../checkpoint-placement-scoring";

/**
 * "In the Loop" (Checkpoint Placement) generates a fresh AI-redesigned workflow
 * for each of the game's five rounds. The workflow is a short, ordered pipeline
 * of steps the AI runs on its own; the player decides WHERE a human-review
 * checkpoint belongs — practising the real skill of human-in-the-loop design.
 *
 * The teaching point is calibration, not "check everything": too few checkpoints
 * lets an irreversible bad call slip through (liability); too many bogs the
 * workflow down and throws away the efficiency the redesign was meant to buy.
 * Each step carries a plain-English `impact` line so a non-technical player can
 * reason about risk from what they read, not from systems knowledge. Difficulty
 * scales the stakes (Low → Medium → High) via `checkpoint-tiers.ts`.
 */

export interface WorkflowStep {
  id: string;
  /** Short imperative title, e.g. "Send the reply". */
  title: string;
  /** What the AI does at this step, one sentence. */
  detail: string;
  /** Plain consequence cue shown to the player: reversible? who does it touch? */
  impact: string;
  /** Ground truth — never sent to the client before scoring. */
  kind: StepKind;
}

export interface CheckpointPlacementScenario {
  /** Short topic label (e.g. "refund pipeline", "staffing review") — keeps rounds distinct. */
  topic: string;
  /** Risk tier for this round, derived from difficulty. */
  riskTier: RiskTier;
  /** Name of the redesigned workflow. */
  workflowName: string;
  /** The colleague who hands over the workflow (styled like a direct message). */
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    /** The hand-off message, in natural language. */
    message: string;
  };
  /** One precise sentence naming what the player must achieve. */
  goal: string;
  /** The ordered pipeline of steps the AI runs. */
  steps: WorkflowStep[];
  // ----- ground truth lives on each step's `kind`; this is the debrief note. -----
  /** Debrief: which steps needed a human, which were safe, and why. */
  explanation: string;
}

/** Shape the model returns (steps without ids; tier is added server-side). */
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
        impact: z.string(),
        kind: z.enum(["critical", "optional", "safe", "trap"]),
      }),
    )
    .min(4)
    .max(6),
  explanation: z.string(),
});

export type RawCheckpointPlacementScenario = z.infer<typeof scenarioSchema>;

const SYSTEM_PROMPT = `You generate rounds for "In the Loop", a game that teaches people how to place HUMAN-REVIEW CHECKPOINTS in an AI-redesigned workflow — the skill of human-in-the-loop design. The hard lesson runs both ways: too FEW checkpoints lets an irreversible bad decision slip through (liability), but too MANY bogs the workflow down and throws away the speed the redesign was meant to buy.

Each round is a realistic workplace process that has been redesigned so an AI runs the steps on its own (e.g. handling refunds, screening submissions, drafting and sending replies, recommending staffing). You produce the workflow as a short ORDERED pipeline of steps. The player will tick the steps where a human must review BEFORE the AI's action takes effect. Every step is labelled with exactly one "kind":
- "critical": a human MUST review here. The action is hard or impossible to undo, or it judges/affects a real person, money, or a legally-sensitive outcome. Leaving it unguarded is a real liability.
- "optional": a checkpoint here is a reasonable judgment call but not required — scored neutral.
- "safe": plainly fine to leave to the AI — internal, low-stakes and easily reversible. A checkpoint here just wastes time.
- "trap": the dangerous temptation. The step SOUNDS high-stakes so a cautious player wants to check it, but its impact line reveals it is actually reversible, internal, or a draft that goes nowhere yet. Checkpointing it needlessly slows the workflow. Each trap must be genuinely tempting.

Fields:
- "topic": a 1-4 word label for the workflow's subject (e.g. "refund pipeline", "staffing review").
- "workflowName": a short name for the redesigned workflow.
- "brief": a colleague (name, role, two-letter initials) and a short, natural message handing the player the workflow and asking them to place checkpoints.
- "goal": one precise sentence naming what good placement achieves (safe but still fast).
- "steps": 4-6 steps in the order the AI runs them. Each has a short "title", a one-sentence "detail" of what the AI does, an "impact" line in PLAIN language that tells the player the consequence (is it reversible? who does it reach?), and its "kind". Write impact lines so a non-technical reader can judge the risk from them — for a "critical" step make the irreversibility/human impact clear; for a "trap" make the impact line quietly reveal it is reversible/internal even though the title sounds scary; for "safe" make it obviously trivial.
- "explanation": one short paragraph for the debrief — name which steps needed a human and why, call out any trap, and state the calibration lesson.

Rules:
- The correct placement must be inferable from the impact lines alone — never require outside knowledge.
- Do NOT order steps by kind; the critical steps must not always be last.
- Keep workflows grounded, professional and varied across rounds (different industries/subjects).`;

/** Attach stable ids (s1..sN) to each step, plus the round's risk tier. */
export function withStepIds(
  raw: RawCheckpointPlacementScenario,
  riskTier: RiskTier,
): CheckpointPlacementScenario {
  const steps: WorkflowStep[] = raw.steps.map((s, i) => ({
    id: `s${i + 1}`,
    title: s.title,
    detail: s.detail,
    impact: s.impact,
    kind: s.kind,
  }));
  return {
    topic: raw.topic,
    riskTier,
    workflowName: raw.workflowName,
    brief: raw.brief,
    goal: raw.goal,
    steps,
    explanation: raw.explanation,
  };
}

/**
 * Generate a round at the given difficulty (1-5). Falls back to a mock bank when
 * no AI provider is configured (or on error). `opts.avoidTopics` lists topics
 * already used earlier in the play-through so the five rounds stay distinct.
 *
 * Difficulty scales the stakes: low-risk rounds barely need a human (so the
 * lesson is "don't over-checkpoint"); high-risk rounds plant several irreversible
 * steps that must be guarded alongside tempting traps that must not.
 */
export async function generateCheckpointPlacementRound(
  difficulty: number,
  opts: { avoidTopics?: string[] } = {},
): Promise<CheckpointPlacementScenario> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  const tier = tierInfoForDifficulty(d);

  if (!isConfigured()) {
    return mockCheckpointPlacementRound(d);
  }

  const avoid = (opts.avoidTopics ?? []).filter(Boolean);
  const avoidNote = avoid.length
    ? ` Do NOT reuse any of these already-used topics (pick a clearly different subject): ${avoid.join("; ")}.`
    : "";

  try {
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one "In the Loop" round at difficulty ${d} of 5. ${tier.guidance} Pick a fresh, recognisable workflow and set "topic" to a short label for it.${avoidNote} Make sure the correct checkpoint placement is inferable from the impact lines, and that every trap would plausibly tempt a cautious player yet waste time if checkpointed.`,
      maxOutputTokens: 1536,
    });

    return withStepIds(raw, tier.tier);
  } catch {
    return mockCheckpointPlacementRound(d);
  }
}

/**
 * Simulate ONE run of the workflow with the player's checkpoints in place, so the
 * scorecard shows what their oversight design produced — an unguarded critical
 * step lets a bad call slip through; needless checkpoints add drag (the same
 * "what it produced" idea as Prompt Golf / Context Calibration). Illustrative
 * only; the score is graded deterministically from the step kinds, not this text.
 * Falls back to a deterministic stand-in when no provider is configured (or on error).
 */
export async function generateCheckpointPlacementOutcome(args: {
  scenario: CheckpointPlacementScenario;
  checkpointedIds: string[];
}): Promise<string> {
  const { scenario, checkpointedIds } = args;
  const checkpointed = new Set(checkpointedIds);

  if (!isConfigured()) {
    return mockCheckpointPlacementOutcome(scenario, checkpointed);
  }

  const stepLines = scenario.steps
    .map(
      (s) =>
        `- ${s.title} — ${s.detail} (impact: ${s.impact}) [${
          checkpointed.has(s.id) ? "HUMAN CHECKPOINT" : "runs automatically"
        }]`,
    )
    .join("\n");

  try {
    return await generatePlainText({
      system:
        "You narrate a single run of an AI workflow to show the consequences of where a human checkpoint was or wasn't placed. In 2-4 sentences, tell the story of this run: if a high-stakes, hard-to-reverse step ran with NO human checkpoint, show the plausible bad outcome that slipped through. If safe or reversible steps were gated with needless checkpoints, note the delay/bottleneck that added. If the placement was well-calibrated, say the workflow ran fast and the one risky moment was caught. Be concrete and grounded; do not lecture.",
      prompt: `Workflow: ${scenario.workflowName}\nGoal: ${scenario.goal}\n\nSteps (in order):\n${stepLines}`,
      maxOutputTokens: 320,
    });
  } catch {
    return mockCheckpointPlacementOutcome(scenario, checkpointed);
  }
}

/** Deterministic stand-in run narration for the offline / mock path. */
function mockCheckpointPlacementOutcome(
  scenario: CheckpointPlacementScenario,
  checkpointed: Set<string>,
): string {
  const unguardedCritical = scenario.steps.filter(
    (s) => s.kind === "critical" && !checkpointed.has(s.id),
  );
  const overChecked = scenario.steps.filter(
    (s) => (s.kind === "safe" || s.kind === "trap") && checkpointed.has(s.id),
  );

  if (unguardedCritical.length > 0) {
    const s = unguardedCritical[0];
    return `The workflow ran end to end with no one watching "${s.title}". ${s.impact} — and because nothing was caught there, a bad call went through that can't easily be walked back. That's the liability a checkpoint was meant to prevent.`;
  }
  if (overChecked.length >= 2) {
    return `Nothing dangerous slipped through — but you parked a human in front of ${overChecked.length} steps that were already safe and reversible, so the redesign that was meant to be fast spent days waiting on sign-offs it never needed.`;
  }
  if (overChecked.length === 1) {
    return `The risky moment was caught and the run was sound — though the extra checkpoint on "${overChecked[0].title}" added a little drag for a step that could have run on its own.`;
  }
  return `Clean run: the AI handled the routine steps on its own and the one moment that truly needed a human was caught before it could do any harm. Fast and safe — exactly the balance.`;
}
