/**
 * Pure, dependency-free scoring helpers for "Context Calibration".
 *
 * Imports nothing from the AI connector or the server runtime so it can be
 * shared by BOTH the scoring route (server) and the game component (client) —
 * the live preview and the official score use the same maths.
 *
 * Scoring model (see docs/GAME-RULES.md): two axes per round, graded against the
 * stored `kind` of every candidate context snippet.
 *
 *   completeness = essentialsIncluded / essentialsTotal   (the GATE)
 *   focus        = 1 - weightedBadIncluded / weightedBadTotal
 *   scoreRatio   = 0.5 * completeness + 0.5 * focus
 *
 * `focus` weights a DISTRACTOR (plausible but misleading) twice as heavily as
 * plain noise, so over-stuffing the context with misleading detail bites
 * hardest. Completeness gates: if any essential is left out the round is capped
 * at GATE_CAP (0.5) — below the 65% clear — just as precision gates Prompt Golf.
 *
 * Worked outcomes that pin the two lessons:
 *  - perfect curation        → 1.0  (exceptional)
 *  - essentials in, dump ALL bad snippets → focus 0 → 0.5  (fails — "too much misdirects")
 *  - an essential left out    → capped 0.5 (fails — too sparse)
 */

/** Ground-truth label every candidate snippet carries. */
export type ContextItemKind = "essential" | "helpful" | "noise" | "distractor";

export const COMPLETENESS_WEIGHT = 0.5;
export const FOCUS_WEIGHT = 0.5;
/** A misleading snippet costs twice what plain noise does. */
export const NOISE_WEIGHT = 1;
export const DISTRACTOR_WEIGHT = 2;
/** Missing any essential caps the round here — below the 65% clear. */
export const GATE_CAP = 0.5;

/** Share of the essential snippets the player actually included (the gate). */
export function completenessFor(
  essentialsIncluded: number,
  essentialsTotal: number,
): number {
  if (essentialsTotal <= 0) return 1;
  return essentialsIncluded / essentialsTotal;
}

/**
 * How well the player avoided the bad snippets (noise + distractors). 1 when no
 * bad snippet is included, 0 when every one is, with distractors weighted 2×.
 */
export function focusFor(
  noiseIncluded: number,
  distractorIncluded: number,
  noiseTotal: number,
  distractorTotal: number,
): number {
  const badTotal = noiseTotal * NOISE_WEIGHT + distractorTotal * DISTRACTOR_WEIGHT;
  if (badTotal <= 0) return 1;
  const badIncluded =
    noiseIncluded * NOISE_WEIGHT + distractorIncluded * DISTRACTOR_WEIGHT;
  return Math.max(0, 1 - badIncluded / badTotal);
}

/** Combine the two axes into a [0,1] ratio, applying the missing-essential gate. */
export function scoreRatioFor(completeness: number, focus: number): number {
  const raw = COMPLETENESS_WEIGHT * completeness + FOCUS_WEIGHT * focus;
  if (completeness < 1) return Math.min(raw, GATE_CAP);
  return Math.max(0, Math.min(1, raw));
}

/** A perfect round: every essential in, no noise and no distractors. */
export function isExceptional(completeness: number, focus: number): boolean {
  return completeness >= 1 && focus >= 1;
}

export interface GradedSelection {
  completeness: number;
  focus: number;
  scoreRatio: number;
  exceptional: boolean;
  essentialsTotal: number;
  essentialsIncluded: number;
  noiseTotal: number;
  noiseIncluded: number;
  distractorTotal: number;
  distractorIncluded: number;
}

/**
 * Grade a selection against the labelled candidate snippets. Pure: the route and
 * the client both call this so the displayed maths matches the awarded score.
 */
export function gradeSelection(
  items: { id: string; kind: ContextItemKind }[],
  selectedIds: string[],
): GradedSelection {
  const selected = new Set(selectedIds);
  let essentialsTotal = 0;
  let essentialsIncluded = 0;
  let noiseTotal = 0;
  let noiseIncluded = 0;
  let distractorTotal = 0;
  let distractorIncluded = 0;

  for (const item of items) {
    const inSelection = selected.has(item.id);
    if (item.kind === "essential") {
      essentialsTotal += 1;
      if (inSelection) essentialsIncluded += 1;
    } else if (item.kind === "noise") {
      noiseTotal += 1;
      if (inSelection) noiseIncluded += 1;
    } else if (item.kind === "distractor") {
      distractorTotal += 1;
      if (inSelection) distractorIncluded += 1;
    }
    // "helpful" is neutral — it neither gates nor penalises.
  }

  const completeness = completenessFor(essentialsIncluded, essentialsTotal);
  const focus = focusFor(
    noiseIncluded,
    distractorIncluded,
    noiseTotal,
    distractorTotal,
  );
  const scoreRatio = scoreRatioFor(completeness, focus);

  return {
    completeness,
    focus,
    scoreRatio,
    exceptional: isExceptional(completeness, focus),
    essentialsTotal,
    essentialsIncluded,
    noiseTotal,
    noiseIncluded,
    distractorTotal,
    distractorIncluded,
  };
}
