/**
 * Model tiers for "Spot the Hallucination".
 *
 * The five rounds are framed as answers from progressively more capable models —
 * mirroring the AI Foundations course (Slide 7: Small / Mid / Frontier). The
 * point is to teach an *accurate* mental model rather than "AI lies all the
 * time": fabrication risk falls as the model gets more capable (and rises as
 * the task gets harder), but even a frontier model isn't infallible — so you
 * still verify the claims that matter.
 *
 * Pure and dependency-free so it can be shared by the client component, the
 * generator and the scoring/route code alike.
 */

export type ModelTier = "quick" | "mid" | "frontier";

export interface TierInfo {
  tier: ModelTier;
  /** Short badge label, matching the Foundations course (Small / Mid / Frontier). */
  label: string;
  /** The model persona shown in the chat header. */
  modelName: string;
  /** One-line reliability note used in copy and the round intro. */
  note: string;
  /** Guidance handed to the generator about how often/obviously this tier slips. */
  fabricationGuidance: string;
}

/**
 * Map a round difficulty (1-5) to a model tier:
 * - difficulty 1     → quick (Small)
 * - difficulty 2-3   → mid
 * - difficulty 4-5   → frontier
 */
export function tierForDifficulty(difficulty: number): ModelTier {
  if (difficulty <= 1) return "quick";
  if (difficulty <= 3) return "mid";
  return "frontier";
}

export const TIER_INFO: Record<ModelTier, TierInfo> = {
  quick: {
    tier: "quick",
    label: "Small",
    modelName: "The quick assistant",
    note: "Fast and cheap — but it guesses freely, so fabrications are common and usually obvious.",
    fabricationGuidance:
      "This is a SMALL, quick model that hallucinates freely: plant 2-3 fabrications and make them fairly blatant (an over-precise invented statistic, an obviously wrong name, a citation to a source that was never provided).",
  },
  mid: {
    tier: "mid",
    label: "Mid",
    modelName: "The everyday model",
    note: "More capable — fabrications are rarer and subtler, and a clue can hide in its reasoning.",
    fabricationGuidance:
      "This is a MID-TIER model that is mostly reliable: plant 1-2 fabrications and make them subtler than a small model's — and sometimes bury the only clue in the reasoning steps rather than the answer.",
  },
  frontier: {
    tier: "frontier",
    label: "Frontier",
    modelName: "The deep thinker",
    note: "The most reliable tier — it rarely makes things up, so don't over-flag. But it's not infallible; verify what matters.",
    fabricationGuidance:
      "This is a FRONTIER model that is highly reliable: plant 0-1 fabrications (often ZERO — a perfectly sound answer is a valid round), and if you do plant one make it very subtle and easy to miss. The lesson is that strong models rarely fabricate, so the player must resist over-flagging.",
  },
};

export function tierInfoForDifficulty(difficulty: number): TierInfo {
  return TIER_INFO[tierForDifficulty(difficulty)];
}
