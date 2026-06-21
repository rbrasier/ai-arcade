import { z } from "zod";

import { generateJson, generatePlainText, isConfigured } from "./connector";
import {
  mockWorkflowRedesignScenario,
  mockIdeationSynthesis,
  mockValidationCritique,
  mockWorkflowRedesignOutcome,
} from "./workflow-redesign-mock";
import type {
  CapabilityKind,
  CheckpointKind,
  ImplTier,
  StageBuild,
  StageGroundTruth,
  WorkflowImpact,
} from "../workflow-redesign-scoring";
import { CAPABILITY_BY_KIND, IMPL_BY_TIER } from "../workflow-redesign-blocks";

/**
 * The Act Four capstone, "Workflow Redesign Challenge", generates a realistic,
 * recognisable corporate workflow (HR onboarding, expense review, …) that the
 * player redesigns around AI's strengths across four phases: Setup (read the
 * as-is workflow and its bottlenecks), Ideation (free-text analysis the AI
 * synthesises into insights), Build (a drag-and-drop canvas of capability blocks
 * + implementation tiers + human checkpoints) and Validate (an AI critique on
 * technical and governance dimensions, on top of a deterministic score).
 *
 * The scenario carries hidden ground truth on every stage — the capability and
 * implementation tier that best fit the bottleneck, and whether a human
 * checkpoint is governance-critical — which is stripped before reaching the
 * client and used only by the deterministic scorer.
 */

/** One stage of the current ("as-is") workflow, with hidden ground truth. */
export interface WorkflowStage extends StageGroundTruth {
  /** Short imperative name, e.g. "Verify ID documents". */
  name: string;
  /** What happens today and why it's a bottleneck. */
  painPoint: string;
  /** Rough human time cost today, e.g. "~40 min/hire". */
  timeCost: string;
  /** Debrief note: why these capability / impl / checkpoint answers are right. */
  rationale: string;
}

export interface WorkflowRedesignScenario {
  /** Short topic label (e.g. "HR onboarding") — also keeps replays distinct. */
  topic: string;
  /** The seeded scenario key this round was generated for. */
  scenarioKey: string;
  /** Name of the workflow being redesigned. */
  workflowName: string;
  /** A colleague handing over the workflow, styled like a direct message. */
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  /** One precise sentence naming what a good redesign achieves. */
  goal: string;
  /** Items this workflow processes per month — the volume time savings scale over. */
  volumePerMonth: number;
  /** The ordered as-is stages the player will redesign. */
  stages: WorkflowStage[];
  /** Debrief: the shape of a strong redesign and the key trade-offs. */
  explanation: string;
}

const CAPABILITY_ENUM = ["summarise", "classify", "extract", "flag", "draft"] as const;
const IMPL_ENUM = ["rules", "llm", "custom-app"] as const;
const CHECKPOINT_ENUM = ["critical", "trap", "safe", "optional"] as const;

/** Shape the model returns (ids are added server-side). */
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
  volumePerMonth: z.number().positive(),
  stages: z
    .array(
      z.object({
        name: z.string(),
        painPoint: z.string(),
        timeCost: z.string(),
        manualMinutes: z.number().positive(),
        bestCapability: z.enum(CAPABILITY_ENUM),
        acceptableCapabilities: z.array(z.enum(CAPABILITY_ENUM)).min(1),
        bestImpl: z.enum(IMPL_ENUM),
        acceptableImpls: z.array(z.enum(IMPL_ENUM)).min(1),
        checkpointKind: z.enum(CHECKPOINT_ENUM),
        rationale: z.string(),
      }),
    )
    .min(4)
    .max(5),
  explanation: z.string(),
});

export type RawWorkflowRedesignScenario = z.infer<typeof scenarioSchema>;

const SYSTEM_PROMPT = `You generate scenarios for the "Workflow Redesign Challenge", the capstone game of an AI-literacy arcade. The player redesigns a real corporate workflow around AI's strengths — not just speeding up the old steps, but rebuilding each one with the right AI capability, the right implementation, and human review exactly where it belongs.

Produce a realistic, recognisable workplace workflow as an ORDERED list of 4-5 current ("as-is") stages, each a genuine bottleneck or manual chore today. For each stage you also decide the hidden ground truth the game grades against.

The player has a fixed palette of CAPABILITY blocks to assign to each stage:
- "summarise": condense long inputs into key points.
- "classify": sort/route an item into categories (approve/reject, type, priority).
- "extract": pull specific fields/figures out of messy documents into structured data.
- "flag": surface anomalies, risks or exceptions for a human.
- "draft": generate a first-pass document/reply/plan for review.

…and for each block, an IMPLEMENTATION tier:
- "rules": rules-based filter — fast, cheap, predictable, but brittle and blind to nuance. Right for simple, deterministic checks.
- "llm": an LLM — handles language and nuance, but can hallucinate, so it suits judgement on text where errors are caught downstream.
- "custom-app": an IT-built tailored application — highest capability and speed, but only worth commissioning when the volume or stakes justify the build (high throughput, integration, or a defensible audit trail).

…and a human-review CHECKPOINT decision. Each stage's "checkpointKind" is exactly one of:
- "critical": a human MUST review here — the stage makes an irreversible decision, commits money, or affects a real person's outcome/record. Leaving it fully automated is a governance liability.
- "trap": the tempting-but-wrong checkpoint. The stage SOUNDS high-stakes so a cautious player wants to gate it, but it is actually reversible, internal, or only a draft — gating it just adds drag.
- "safe": plainly fine to automate — low-stakes and reversible.
- "optional": a reasonable judgement call either way — scored neutral.

For each stage provide: "name", "painPoint" (what's slow/manual today), "timeCost" (rough human time today, e.g. "~30 min/hire"), "manualMinutes" (the same human time as a plain NUMBER of minutes per item, consistent with timeCost), "bestCapability" + "acceptableCapabilities" (include the best one in the list), "bestImpl" + "acceptableImpls" (include the best one), "checkpointKind", and a one-sentence "rationale" for the debrief.

Also provide a workflow-level "volumePerMonth": a realistic NUMBER of items this workflow processes each month (e.g. ~90 hires/month, ~800 claims/month) — it scales how much time the redesign saves, so make it plausible for the workflow's scale.

Design rules:
- Make the best capability clearly the natural fit for the bottleneck described.
- Use the FULL range of implementation tiers across the stages — at least one stage where a custom application is genuinely warranted (high volume or stakes), and at least one where a custom app would be wasteful over-engineering (so "rules" or "llm" is best). Teaching when to commission a custom build is a core outcome.
- Include at least one "critical" governance stage and at least one "trap", so the player must place human review thoughtfully, not everywhere.
- Keep it grounded and professional. Set "topic" to a short label for the workflow.
- "goal": one sentence on what a strong redesign achieves (faster AND defensible).
- "explanation": a short paragraph describing the shape of a strong redesign and the key trade-offs.`;

/** Attach stable ids (st1..stN) to each stage. */
export function withStageIds(
  raw: RawWorkflowRedesignScenario,
  scenarioKey: string,
): WorkflowRedesignScenario {
  const stages: WorkflowStage[] = raw.stages.map((s, i) => ({
    id: `st${i + 1}`,
    name: s.name,
    painPoint: s.painPoint,
    timeCost: s.timeCost,
    manualMinutes: s.manualMinutes,
    bestCapability: s.bestCapability as CapabilityKind,
    acceptableCapabilities: s.acceptableCapabilities as CapabilityKind[],
    bestImpl: s.bestImpl as ImplTier,
    acceptableImpls: s.acceptableImpls as ImplTier[],
    checkpointKind: s.checkpointKind as CheckpointKind,
    rationale: s.rationale,
  }));
  return {
    topic: raw.topic,
    scenarioKey,
    workflowName: raw.workflowName,
    brief: raw.brief,
    goal: raw.goal,
    volumePerMonth: raw.volumePerMonth,
    stages,
    explanation: raw.explanation,
  };
}

/**
 * Generate a scenario for the given seeded scenario key (e.g. "hr-onboarding").
 * Falls back to a deterministic mock bank when no AI provider is configured (or
 * on error). `opts.avoidTopics` lists topics already used in this session so a
 * replay picks a clearly different subject.
 */
export async function generateWorkflowRedesignRound(
  scenarioKey: string,
  opts: { avoidTopics?: string[] } = {},
): Promise<WorkflowRedesignScenario> {
  if (!isConfigured()) {
    return mockWorkflowRedesignScenario(scenarioKey);
  }

  const avoid = (opts.avoidTopics ?? []).filter(Boolean);
  const avoidNote = avoid.length
    ? ` Do NOT reuse any of these already-used topics (pick a clearly different subject): ${avoid.join("; ")}.`
    : "";
  const seedNote =
    scenarioKey === "hr-onboarding"
      ? "Base the workflow on HR new-hire onboarding."
      : scenarioKey === "expense-review"
        ? "Base the workflow on employee expense review and reimbursement."
        : "Pick a recognisable corporate back-office workflow.";

  try {
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one Workflow Redesign scenario. ${seedNote}${avoidNote} Make sure the best capability and implementation tier for each stage are inferable from its painPoint, and that the governance-critical stages and the trap are clearly distinguishable from the impact described.`,
      maxOutputTokens: 2048,
    });
    return withStageIds(raw, scenarioKey);
  } catch {
    return mockWorkflowRedesignScenario(scenarioKey);
  }
}

/**
 * Phase 2 (Ideation): take the player's free-text analysis of the workflow and
 * synthesise it into 2-4 short, structured insight bullets that prime the Build.
 * Formative and unscored. Falls back to a deterministic synthesis offline.
 */
export async function synthesiseIdeation(args: {
  scenario: WorkflowRedesignScenario;
  notes: string;
}): Promise<string[]> {
  const { scenario, notes } = args;
  const trimmed = notes.trim();

  if (!isConfigured()) {
    return mockIdeationSynthesis(scenario, trimmed);
  }

  const stageLines = scenario.stages
    .map((s) => `- ${s.name}: ${s.painPoint} (${s.timeCost})`)
    .join("\n");

  const insightSchema = z.object({
    insights: z.array(z.string()).min(2).max(4),
  });

  try {
    const out = await generateJson(insightSchema, {
      system:
        "You are a workflow-redesign coach. The player has written free-form notes analysing where an AI could add value to a workflow. Synthesise THEIR thinking into 2-4 short, sharp insight bullets (each one sentence) that will guide their redesign — name the bottleneck and the kind of AI capability that fits it. Build on what they wrote; gently fill an obvious gap if they missed a major bottleneck, but do not lecture or grade.",
      prompt: `Workflow: ${scenario.workflowName}\nGoal: ${scenario.goal}\n\nCurrent stages:\n${stageLines}\n\nThe player's notes:\n"""${trimmed || "(they left this blank)"}"""`,
      maxOutputTokens: 400,
    });
    return out.insights;
  } catch {
    return mockIdeationSynthesis(scenario, trimmed);
  }
}

export interface ValidationCritique {
  /** One-line verdict on the redesign overall. */
  headline: string;
  /** Technical dimension: error/hallucination risk, impl fit, capability fit. */
  technical: string;
  /** Governance dimension: human checkpoints, defensibility of automation. */
  governance: string;
}

/**
 * Phase 4 (Validate): an AI critique of the player's finished design across the
 * two dimensions in the learning outcomes — technical and governance. This is
 * illustrative narration ON TOP OF the deterministic score; it never sets the
 * score. Falls back to a deterministic critique offline (or on error).
 */
export async function generateValidationCritique(args: {
  scenario: WorkflowRedesignScenario;
  builds: StageBuild[];
}): Promise<ValidationCritique> {
  const { scenario, builds } = args;
  const byId = new Map(builds.map((b) => [b.stageId, b]));

  if (!isConfigured()) {
    return mockValidationCritique(scenario, byId);
  }

  const designLines = scenario.stages
    .map((s) => {
      const b = byId.get(s.id);
      const cap = b?.capability
        ? CAPABILITY_BY_KIND[b.capability].label
        : "left manual";
      const impl = b?.impl ? IMPL_BY_TIER[b.impl].label : "—";
      const guard = b?.checkpoint ? "HUMAN CHECKPOINT" : "fully automated";
      return `- ${s.name} (today: ${s.painPoint}) → ${cap} via ${impl}, ${guard}`;
    })
    .join("\n");

  const critiqueSchema = z.object({
    headline: z.string(),
    technical: z.string(),
    governance: z.string(),
  });

  try {
    return await generateJson(critiqueSchema, {
      system:
        "You are an AI-transformation reviewer critiquing a player's redesigned workflow. Be specific and grounded, referencing their actual choices by stage. Return a one-line 'headline' verdict, then two 2-3 sentence critiques: 'technical' (does each capability + implementation fit the task? where is hallucination or error risk, and is it caught? is a custom application over- or under-used?) and 'governance' (are human checkpoints on the irreversible / person-affecting steps? are automated decisions defensible? did they over-gate reversible steps and lose the speed?). Praise what works and name what would fail in production. Do not output a numeric score.",
      prompt: `Workflow: ${scenario.workflowName}\nGoal: ${scenario.goal}\n\nThe player's redesign:\n${designLines}`,
      maxOutputTokens: 500,
    });
  } catch {
    return mockValidationCritique(scenario, byId);
  }
}

/**
 * Narrate ONE run of the redesigned workflow once it goes live, so the scorecard
 * shows what the player's choices DID — in plain speed-and-quality terms (the same
 * "what it produced" idea as Prompt Golf / In the Loop). Fed the deterministic
 * `impact` metrics so the prose and the numbers agree. Illustrative only; it never
 * affects the score. Falls back to a deterministic stand-in offline (or on error).
 */
export async function generateWorkflowRedesignOutcome(args: {
  scenario: WorkflowRedesignScenario;
  builds: StageBuild[];
  impact: WorkflowImpact;
}): Promise<string> {
  const { scenario, builds, impact } = args;
  const byId = new Map(builds.map((b) => [b.stageId, b]));

  if (!isConfigured()) {
    return mockWorkflowRedesignOutcome(scenario, impact);
  }

  const bandById = new Map(impact.stages.map((s) => [s.id, s.band]));
  const designLines = scenario.stages
    .map((s) => {
      const b = byId.get(s.id);
      const cap = b?.capability ? CAPABILITY_BY_KIND[b.capability].label : "left manual";
      const impl = b?.impl ? IMPL_BY_TIER[b.impl].label : "—";
      const guard = b?.checkpoint ? "human checkpoint" : "fully automated";
      return `- ${s.name}: ${cap} via ${impl}, ${guard} [${bandById.get(s.id)}]`;
    })
    .join("\n");

  const metrics = `Cycle time per item: ${Math.round(impact.beforeMinutes)} min by hand → ${Math.round(impact.afterMinutes)} min redesigned (${Math.round(impact.pctFaster * 100)}% faster), ~${impact.hoursSavedPerMonth} human-hours saved per month across ${impact.volumePerMonth} items. Verdict: ${impact.verdict}.`;

  try {
    return await generatePlainText({
      system:
        "You narrate a single run of a redesigned workflow once it goes live, to show the player the consequences of their choices in plain SPEED and QUALITY terms. In 2-4 grounded sentences: lead with how much faster it now runs (use the given numbers), then name the most important quality consequence of their build — an 'unaddressed' step still done by hand, an 'under-powered' step letting errors through, a 'hallucination-exposed' step where an unguarded AI decision reached someone, an 'over-built' step costing more than it needs, or — if all sound — that it ran fast and the risky moments were caught. If they over-reviewed reversible steps, note the speed handed back. Do not lecture, do not output a score, and keep the numbers consistent with those given.",
      prompt: `Workflow: ${scenario.workflowName}\nGoal: ${scenario.goal}\n\nMetrics:\n${metrics}\n\nThe player's redesign:\n${designLines}`,
      maxOutputTokens: 320,
    });
  } catch {
    return mockWorkflowRedesignOutcome(scenario, impact);
  }
}

/** Plain-text helper retained for parity with other games (unused fallback). */
export async function generateValidationHeadline(
  scenario: WorkflowRedesignScenario,
): Promise<string> {
  if (!isConfigured()) return `Redesign of ${scenario.workflowName} reviewed.`;
  try {
    return await generatePlainText({
      system: "Write a single short verdict line for a redesigned workflow.",
      prompt: scenario.workflowName,
      maxOutputTokens: 60,
    });
  } catch {
    return `Redesign of ${scenario.workflowName} reviewed.`;
  }
}
