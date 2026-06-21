/**
 * Pure, dependency-free ORG-SCALE impact model for "In the Loop" (Checkpoint
 * Placement). Imports nothing from the AI connector or the server runtime so it
 * can be shared by the scoring route and the client.
 *
 * This is FEEDBACK ONLY — it never touches the score (the same illustrative
 * "what it produced" layer as Prompt Golf / the Workflow Redesign capstone, see
 * docs/GAME-RULES.md). Its job is to make the player FEEL what their checkpoint
 * placement would do once the same workflow runs at organisation scale, by
 * playing the workflow out three ways and comparing them side by side:
 *
 *   - "manual"  — every step still done by a human, no AI (slow, but a human's
 *                 judgement sits on every call).
 *   - "picked"  — the AI runs the steps, with a human checkpoint exactly where
 *                 the PLAYER placed one.
 *   - "ai"      — the AI runs every step on its own, no human in the loop.
 *
 * For each it estimates, across a quarter in a 5,000-person organisation: how
 * many times the workflow runs, the total (and average) time it costs, the
 * routine processing errors and the serious "high-level" consequences (an
 * uncaught error on an irreversible/person-affecting step), and a single NET
 * figure that folds time and both kinds of error into one comparable number.
 *
 * The teaching payoff falls straight out of the model: doing everything by hand
 * is safe-ish but enormously slow; handing an irreversible workflow entirely to
 * the AI is lightning fast but lets serious mistakes through unchecked; and the
 * calibrated middle — checkpoints only where they earn their cost — wins on the
 * net, nearly matching the AI on speed while matching the human on safety.
 */

import type { StepKind } from "./checkpoint-placement-scoring";

/** The organisation the impact is projected over. */
export const ORG_SIZE = 5000;

// ---- speed model (mirrors the Workflow Redesign consequences read) ----
/** An AI runs a step in this fraction of the human time. */
export const AI_SPEED_FACTOR = 0.06;
/** An automated step never drops below this many minutes. */
export const AUTOMATION_FLOOR_MIN = 0.3;
/** A human checkpoint adds review time back: this fraction of the manual time… */
export const CHECKPOINT_REVIEW_FRACTION = 0.3;
/** …but never less than this many minutes. */
export const CHECKPOINT_REVIEW_MIN = 2;

// ---- error model ----
/**
 * A human doing a routine step by hand slips at this flat rate. On a CRITICAL
 * step (a judgement about a person / an irreversible call) a human is far more
 * careful and accountable, so the rate is lower.
 */
export const MANUAL_ERROR_RATE = 0.04;
export const MANUAL_CRITICAL_ERROR_RATE = 0.02;
/**
 * An AI running a step on its own is reliable on routine work but more
 * error-prone the more judgement the step demands — highest on the critical,
 * high-stakes steps where a slip becomes a real incident.
 */
export const AI_ERROR_RATE: Record<StepKind, number> = {
  safe: 0.02,
  optional: 0.05,
  trap: 0.03,
  critical: 0.1,
};
/** A human checkpoint reviews the AI's output for that step and catches most slips. */
export const CHECKPOINT_CATCH_RATE = 0.85;

// ---- cost model: everything folded into equivalent hours so the three
// approaches compare on one axis (lower is better) ----
/** A routine processing slip costs about this much rework. */
export const ERROR_REWORK_HOURS = 1;
/** A high-level consequence (uncaught critical error) costs this much cleanup/liability. */
export const CONSEQUENCE_HOURS = 20;

export type RunMode = "manual" | "picked" | "ai";

/** The minimum a step needs from the scenario to be projected. */
export interface ImpactStep {
  id: string;
  kind: StepKind;
  /** Human minutes this step takes today, per workflow run. */
  manualMinutes: number;
}

export interface ColumnImpact {
  mode: RunMode;
  /** Workflow runs processed across the org per quarter (the shared demand). */
  workflows: number;
  /** Total human/AI minutes spent on those runs. */
  totalMinutes: number;
  /** Total time as whole hours. */
  totalHours: number;
  /** Average minutes per workflow run. */
  avgMinutesPerWorkflow: number;
  /** Routine errors that reach the output (non-critical steps). */
  processingErrors: number;
  /** Serious incidents: uncaught errors on irreversible/person-affecting steps. */
  highLevelConsequences: number;
  /** Time + errors + consequences, all in equivalent hours (lower is better). */
  netCostHours: number;
}

export interface OrgImpact {
  orgSize: number;
  /** Workflow runs across the org per quarter. */
  volumePerQuarter: number;
  manual: ColumnImpact;
  picked: ColumnImpact;
  ai: ColumnImpact;
  /** Which approach came out lowest on net cost. */
  bestMode: RunMode;
  /** One-line read comparing the player's placement to the two extremes. */
  verdict: string;
}

function aiMinutes(manualMinutes: number): number {
  return Math.max(AUTOMATION_FLOOR_MIN, manualMinutes * AI_SPEED_FACTOR);
}

function reviewMinutes(manualMinutes: number): number {
  return Math.max(CHECKPOINT_REVIEW_MIN, manualMinutes * CHECKPOINT_REVIEW_FRACTION);
}

/** Minutes one step costs per run, given the mode and whether it's checkpointed. */
function stepMinutes(manualMinutes: number, mode: RunMode, checkpointed: boolean): number {
  if (mode === "manual") return manualMinutes;
  let m = aiMinutes(manualMinutes);
  if (mode === "picked" && checkpointed) m += reviewMinutes(manualMinutes);
  return m;
}

/** Per-run probability a step produces an error that reaches the output. */
function stepErrorRate(kind: StepKind, mode: RunMode, checkpointed: boolean): number {
  if (mode === "manual") {
    return kind === "critical" ? MANUAL_CRITICAL_ERROR_RATE : MANUAL_ERROR_RATE;
  }
  // The AI runs the step.
  const base = AI_ERROR_RATE[kind];
  if (mode === "picked" && checkpointed) return base * (1 - CHECKPOINT_CATCH_RATE);
  return base;
}

function round(n: number): number {
  return Math.round(n);
}

/** Project one approach across the quarter's volume. */
function computeColumn(
  steps: ImpactStep[],
  checkpointed: Set<string>,
  volume: number,
  mode: RunMode,
): ColumnImpact {
  let totalMinutes = 0;
  let processingErrors = 0;
  let highLevelConsequences = 0;

  for (const step of steps) {
    const cp = mode === "picked" && checkpointed.has(step.id);
    totalMinutes += stepMinutes(step.manualMinutes, mode, cp) * volume;
    const stepErrors = stepErrorRate(step.kind, mode, cp) * volume;
    if (step.kind === "critical") highLevelConsequences += stepErrors;
    else processingErrors += stepErrors;
  }

  const totalHours = totalMinutes / 60;
  const netCostHours =
    totalHours +
    processingErrors * ERROR_REWORK_HOURS +
    highLevelConsequences * CONSEQUENCE_HOURS;

  return {
    mode,
    workflows: volume,
    totalMinutes: round(totalMinutes),
    totalHours: round(totalHours),
    avgMinutesPerWorkflow: volume > 0 ? Math.round((totalMinutes / volume) * 10) / 10 : 0,
    processingErrors: round(processingErrors),
    highLevelConsequences: round(highLevelConsequences),
    netCostHours: round(netCostHours),
  };
}

/**
 * Play the workflow out three ways (all-manual, the player's picks, all-AI) and
 * project each across a quarter at organisation scale. Pure: the route is the
 * caller, but keeping it dependency-free matches the other games' scoring libs.
 */
export function computeOrgImpact(
  steps: ImpactStep[],
  checkpointedIds: string[],
  volumePerQuarter: number,
): OrgImpact {
  const checkpointed = new Set(checkpointedIds);
  const volume = Math.max(0, Math.round(volumePerQuarter));

  const manual = computeColumn(steps, checkpointed, volume, "manual");
  const picked = computeColumn(steps, checkpointed, volume, "picked");
  const ai = computeColumn(steps, checkpointed, volume, "ai");

  const byNet: { mode: RunMode; net: number }[] = (
    [
      { mode: "manual", net: manual.netCostHours },
      { mode: "picked", net: picked.netCostHours },
      { mode: "ai", net: ai.netCostHours },
    ] as { mode: RunMode; net: number }[]
  ).sort((a, b) => a.net - b.net);
  const bestMode = byNet[0].mode;

  let verdict: string;
  if (bestMode === "picked") {
    verdict =
      "Your placement wins at scale — almost the AI's speed, with a human catching the calls that would otherwise become real incidents.";
  } else if (bestMode === "manual") {
    verdict =
      "At scale your placement costs more than doing it all by hand — too many serious errors are still slipping through where a checkpoint was needed.";
  } else {
    verdict =
      "At scale the all-AI run comes out ahead of your placement — you've gated steps that didn't need it, paying review time the speed-up was meant to save.";
  }

  return {
    orgSize: ORG_SIZE,
    volumePerQuarter: volume,
    manual,
    picked,
    ai,
    bestMode,
    verdict,
  };
}
