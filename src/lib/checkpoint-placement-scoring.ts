/**
 * Pure, dependency-free scoring helpers for "In the Loop" (Checkpoint Placement).
 *
 * Imports nothing from the AI connector or the server runtime so it can be
 * shared by BOTH the scoring route (server) and the game component (client) —
 * the live preview and the official score use the same maths.
 *
 * Scoring model (see docs/GAME-RULES.md): two axes per round, graded against the
 * stored `kind` of every workflow step. The two failure modes are SYMMETRIC,
 * exactly as the Act Three learning outcome frames them ("too few checkpoints
 * creates liability; too many kills efficiency") — so this mirrors Context
 * Calibration's 0.5 / 0.5 + gate-cap shape rather than a gate-heavy split.
 *
 *   coverage   = criticalCheckpointed / criticalTotal   (the GATE)
 *   efficiency = 1 - weightedOverCheckpointed / weightedSafeTotal
 *   scoreRatio = 0.5 * coverage + 0.5 * efficiency
 *
 * `efficiency` weights a TRAP (a step that looks risky but is actually safe and
 * reversible) twice as heavily as a plainly-safe step, so checkpointing out of
 * fear bites hardest. Coverage gates: if any critical step is left unguarded the
 * round is capped at GATE_CAP (0.5) — below the 65% clear — just as precision
 * gates Prompt Golf.
 *
 * Worked outcomes that pin the two lessons:
 *  - perfect oversight               → 1.0  (exceptional)
 *  - every critical guarded, but a checkpoint on EVERY safe step → efficiency 0
 *                                    → 0.5  (fails — "too many kills efficiency")
 *  - a critical step left unguarded  → capped 0.5 (fails — liability)
 */

/** Ground-truth label every workflow step carries. */
export type StepKind = "critical" | "optional" | "safe" | "trap";

export const COVERAGE_WEIGHT = 0.5;
export const EFFICIENCY_WEIGHT = 0.5;
/** A needless checkpoint on a tempting-but-safe step costs twice a plainly-safe one. */
export const SAFE_WEIGHT = 1;
export const TRAP_WEIGHT = 2;
/** Leaving any critical step unguarded caps the round here — below the 65% clear. */
export const GATE_CAP = 0.5;

/** Share of the critical steps the player actually guarded (the gate). */
export function coverageFor(
  criticalCheckpointed: number,
  criticalTotal: number,
): number {
  if (criticalTotal <= 0) return 1;
  return criticalCheckpointed / criticalTotal;
}

/**
 * How well the player avoided needless checkpoints (safe + trap steps). 1 when no
 * safe step is checkpointed, 0 when every one is, with traps weighted 2×.
 */
export function efficiencyFor(
  safeCheckpointed: number,
  trapCheckpointed: number,
  safeTotal: number,
  trapTotal: number,
): number {
  const overTotal = safeTotal * SAFE_WEIGHT + trapTotal * TRAP_WEIGHT;
  if (overTotal <= 0) return 1;
  const overIncluded =
    safeCheckpointed * SAFE_WEIGHT + trapCheckpointed * TRAP_WEIGHT;
  return Math.max(0, 1 - overIncluded / overTotal);
}

/** Combine the two axes into a [0,1] ratio, applying the unguarded-critical gate. */
export function scoreRatioFor(coverage: number, efficiency: number): number {
  const raw = COVERAGE_WEIGHT * coverage + EFFICIENCY_WEIGHT * efficiency;
  if (coverage < 1) return Math.min(raw, GATE_CAP);
  return Math.max(0, Math.min(1, raw));
}

/** A perfect round: every critical step guarded, no needless checkpoints. */
export function isExceptional(coverage: number, efficiency: number): boolean {
  return coverage >= 1 && efficiency >= 1;
}

export interface GradedPlacement {
  coverage: number;
  efficiency: number;
  scoreRatio: number;
  exceptional: boolean;
  criticalTotal: number;
  criticalCheckpointed: number;
  safeTotal: number;
  safeCheckpointed: number;
  trapTotal: number;
  trapCheckpointed: number;
}

/**
 * Grade a set of placed checkpoints against the labelled workflow steps. Pure:
 * the route and the client both call this so the displayed maths matches the
 * awarded score.
 */
export function gradeCheckpoints(
  steps: { id: string; kind: StepKind }[],
  checkpointedIds: string[],
): GradedPlacement {
  const checkpointed = new Set(checkpointedIds);
  let criticalTotal = 0;
  let criticalCheckpointed = 0;
  let safeTotal = 0;
  let safeCheckpointed = 0;
  let trapTotal = 0;
  let trapCheckpointed = 0;

  for (const step of steps) {
    const guarded = checkpointed.has(step.id);
    if (step.kind === "critical") {
      criticalTotal += 1;
      if (guarded) criticalCheckpointed += 1;
    } else if (step.kind === "safe") {
      safeTotal += 1;
      if (guarded) safeCheckpointed += 1;
    } else if (step.kind === "trap") {
      trapTotal += 1;
      if (guarded) trapCheckpointed += 1;
    }
    // "optional" is neutral — a checkpoint there neither gates nor penalises.
  }

  const coverage = coverageFor(criticalCheckpointed, criticalTotal);
  const efficiency = efficiencyFor(
    safeCheckpointed,
    trapCheckpointed,
    safeTotal,
    trapTotal,
  );
  const scoreRatio = scoreRatioFor(coverage, efficiency);

  return {
    coverage,
    efficiency,
    scoreRatio,
    exceptional: isExceptional(coverage, efficiency),
    criticalTotal,
    criticalCheckpointed,
    safeTotal,
    safeCheckpointed,
    trapTotal,
    trapCheckpointed,
  };
}
