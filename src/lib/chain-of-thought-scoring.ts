/**
 * Pure, dependency-free scoring helpers for "Think It Through".
 *
 * Imports nothing from the AI connector or the server runtime so it can be
 * shared by BOTH the scoring route (server) and the game component (client) —
 * the live preview and the official score use the same maths.
 *
 * Scoring model (see docs/GAME-RULES.md): two binary axes per round.
 *
 *   accuracy  = chose the correct final option   (the GATE, like precision in golf)
 *   judgment  = correct trust call               (the MASTERY axis, like economy)
 *   scoreRatio = 0.65 * accuracy + 0.35 * judgment
 *
 * So a correct answer alone clears (0.65); the judgment call lifts a cleared
 * round into the XP-bonus tiers and, with both correct, an exceptional 100. A
 * wrong final answer caps the round at 0.35 — below the 65% clear — so the
 * answer is the gate, just as precision gates Prompt Golf.
 */

export const ACCURACY_WEIGHT = 0.65;
export const JUDGMENT_WEIGHT = 0.35;

/** Combine the two binary axes into a [0,1] score ratio. */
export function scoreRatioFor(accuracy: boolean, judgment: boolean): number {
  return (accuracy ? ACCURACY_WEIGHT : 0) + (judgment ? JUDGMENT_WEIGHT : 0);
}

/**
 * Was the trust call correct? Trusting the snap answer is right only when the
 * snap answer was actually correct; demanding the working is right only when it
 * wasn't.
 */
export function judgmentCorrect(trusted: boolean, snapCorrect: boolean): boolean {
  return trusted === snapCorrect;
}

/** A perfect round: correct final answer AND a correct trust call. */
export function isExceptional(accuracy: boolean, judgment: boolean): boolean {
  return accuracy && judgment;
}
