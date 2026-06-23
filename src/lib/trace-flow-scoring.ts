/**
 * Pure, dependency-free scoring helpers for "Trace the Flow".
 *
 * Imports nothing from the AI connector or the server runtime so it can be
 * shared by the scoring route (server) and any client code that needs the result
 * shapes. The official score is computed server-side from stored ground truth —
 * the client never holds the answer, so (unlike Prompt Golf's economy) it cannot
 * preview the score; it only renders the graded result this returns.
 *
 * Scoring model (see docs/GAME-RULES.md): two axes, graded against the stored
 * canonical order and hand-off truth. Mirrors the arcade's gate + symmetric
 * mastery shape (Context Calibration / In the Loop).
 *
 *   sequence  = correctlyPlaced / total                 (the GATE)
 *   diagnosis = correctJudgments / totalJudgments        (the MASTERY axis)
 *   scoreRatio = 0.5 * sequence + 0.5 * diagnosis
 *                capped at GATE_CAP (0.5) when sequence < 1
 *
 * `sequence` gates: you have to reconstruct the chain to clear — a single
 * misplacement caps the round below the 65% clear, just as a missing essential
 * gates Context Calibration. `diagnosis` is symmetric: missing a broken hand-off
 * AND raising a false flag both cost (the recurring "resist over-flagging"
 * lesson), and the structural calls (a parallel branch, a loop-back) count too.
 */

export const SEQUENCE_WEIGHT = 0.5;
export const DIAGNOSIS_WEIGHT = 0.5;
/** A mis-sequenced chain caps here — below the 65% clear. */
export const GATE_CAP = 0.5;

/** A directed hand-off between two adjacent steps, by stable id. */
export interface HandoffPair {
  fromId: string;
  toId: string;
}

/** Ground-truth view of one step the grader needs. */
export interface GradedStepTruth {
  id: string;
  /** Canonical 0-based position in the true order. */
  position: number;
  /** Steps sharing a group id may be placed in any internal order (a parallel branch). */
  parallelGroup?: string | null;
}

export interface TraceTruth {
  steps: GradedStepTruth[];
  /** Hand-offs that are broken in the true chain (info lost or reformatted). */
  brokenHandoffs: HandoffPair[];
  /** The single rework loop, if this round has one. */
  loopBack?: HandoffPair | null;
}

export interface TraceSubmission {
  /** The player's ordering of every step id, first to last. */
  orderedIds: string[];
  /** Hand-off boundaries the player flagged as broken (adjacent pairs in their order). */
  brokenPairs: HandoffPair[];
  /** Steps the player marked as running in parallel (round 4). */
  parallelIds?: string[];
  /** The loop-back the player identified (round 5). */
  loopBack?: HandoffPair | null;
}

export interface GradedStep {
  id: string;
  position: number;
  placedIndex: number;
  correct: boolean;
  inParallelGroup: boolean;
}

export interface GradedTrace {
  sequence: number;
  diagnosis: number;
  scoreRatio: number;
  exceptional: boolean;
  steps: GradedStep[];
  total: number;
  correctlyPlaced: number;
  // diagnosis breakdown
  brokenTotal: number;
  brokenCaught: number;
  falseFlags: number;
  hasParallel: boolean;
  parallelCorrect: boolean;
  hasLoopBack: boolean;
  loopBackCorrect: boolean;
  diagnosisItems: number;
}

function samePair(a: HandoffPair, b: HandoffPair): boolean {
  return a.fromId === b.fromId && a.toId === b.toId;
}

/** Build the set of canonical positions occupied by each parallel group. */
function parallelPositions(steps: GradedStepTruth[]): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const s of steps) {
    if (!s.parallelGroup) continue;
    const set = map.get(s.parallelGroup) ?? new Set<number>();
    set.add(s.position);
    map.set(s.parallelGroup, set);
  }
  return map;
}

/**
 * Grade a reconstructed flow against the stored truth. Pure: the score route
 * calls this so the awarded score and the displayed breakdown stay in lockstep.
 */
export function gradeTrace(
  truth: TraceTruth,
  submission: TraceSubmission,
): GradedTrace {
  const total = truth.steps.length;
  const byId = new Map(truth.steps.map((s) => [s.id, s]));
  const groupPositions = parallelPositions(truth.steps);

  // ---- sequence (the gate) ----
  const placedIndex = new Map<string, number>();
  submission.orderedIds.forEach((id, i) => placedIndex.set(id, i));

  const steps: GradedStep[] = truth.steps.map((s) => {
    const idx = placedIndex.has(s.id) ? (placedIndex.get(s.id) as number) : -1;
    const group = s.parallelGroup
      ? groupPositions.get(s.parallelGroup)
      : undefined;
    // A parallel-group member is correct anywhere within its group's positions;
    // a plain step is correct only at its exact canonical position.
    const correct = group ? group.has(idx) : idx === s.position;
    return {
      id: s.id,
      position: s.position,
      placedIndex: idx,
      correct,
      inParallelGroup: Boolean(s.parallelGroup),
    };
  });
  const correctlyPlaced = steps.filter((s) => s.correct).length;
  const sequence = total > 0 ? correctlyPlaced / total : 1;

  // ---- diagnosis (the mastery axis) ----
  const broken = truth.brokenHandoffs ?? [];
  const flagged = submission.brokenPairs ?? [];
  const brokenTotal = broken.length;
  let brokenCaught = 0;
  for (const b of broken) {
    if (flagged.some((f) => samePair(f, b))) brokenCaught += 1;
  }
  // Any flag that doesn't match a truly-broken hand-off is a false flag.
  const falseFlags = flagged.filter(
    (f) => !broken.some((b) => samePair(f, b)),
  ).length;

  // Structural calls present only on their rounds.
  const hasParallel = truth.steps.some((s) => s.parallelGroup);
  let parallelCorrect = false;
  if (hasParallel) {
    const truthSet = new Set(
      truth.steps.filter((s) => s.parallelGroup).map((s) => s.id),
    );
    const picked = new Set(submission.parallelIds ?? []);
    parallelCorrect =
      picked.size === truthSet.size &&
      [...truthSet].every((id) => picked.has(id));
  }

  const hasLoopBack = Boolean(truth.loopBack);
  let loopBackCorrect = false;
  if (hasLoopBack && truth.loopBack) {
    loopBackCorrect = Boolean(
      submission.loopBack && samePair(submission.loopBack, truth.loopBack),
    );
  }

  const structuralItems = (hasParallel ? 1 : 0) + (hasLoopBack ? 1 : 0);
  const structuralCorrect =
    (hasParallel && parallelCorrect ? 1 : 0) +
    (hasLoopBack && loopBackCorrect ? 1 : 0);

  // correct judgments / (correct items + missed broken + false flags).
  const diagnosisItems = brokenTotal + structuralItems + falseFlags;
  const correctJudgments = brokenCaught + structuralCorrect;
  const diagnosis =
    diagnosisItems > 0 ? correctJudgments / diagnosisItems : 1;

  // ---- combine ----
  const raw = SEQUENCE_WEIGHT * sequence + DIAGNOSIS_WEIGHT * diagnosis;
  const scoreRatio =
    sequence < 1 ? Math.min(raw, GATE_CAP) : Math.max(0, Math.min(1, raw));

  const exceptional = sequence >= 1 && diagnosis >= 1;

  return {
    sequence,
    diagnosis,
    scoreRatio,
    exceptional,
    steps,
    total,
    correctlyPlaced,
    brokenTotal,
    brokenCaught,
    falseFlags,
    hasParallel,
    parallelCorrect,
    hasLoopBack,
    loopBackCorrect,
    diagnosisItems,
  };
}
