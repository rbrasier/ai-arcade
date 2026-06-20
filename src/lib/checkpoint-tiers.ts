/**
 * Risk tiers for "In the Loop" (Checkpoint Placement).
 *
 * The five rounds escalate in stakes — Low → Medium → High — exactly as the Act
 * Three learning outcomes describe. The tier teaches an accurate model of
 * human-in-the-loop design: low-risk, reversible workflows barely need a human,
 * so the lesson there is "don't checkpoint everything"; as the stakes rise (a
 * real person is affected, an action can't be undone) more steps genuinely need
 * a human, and the temptation to over-checkpoint out of fear grows too.
 *
 * Pure and dependency-free so it can be shared by the client component, the
 * generator and the scoring/route code alike.
 */

export type RiskTier = "low" | "medium" | "high";

export interface RiskTierInfo {
  tier: RiskTier;
  /** Short badge label shown on the round. */
  label: string;
  /** One-line framing used in copy and the round intro. */
  note: string;
  /** Guidance handed to the generator about how to shape the workflow's risk. */
  guidance: string;
}

/**
 * Map a round difficulty (1-5) to a risk tier:
 * - difficulty 1     → low
 * - difficulty 2-3   → medium
 * - difficulty 4-5   → high
 */
export function tierForDifficulty(difficulty: number): RiskTier {
  if (difficulty <= 1) return "low";
  if (difficulty <= 3) return "medium";
  return "high";
}

export const RISK_TIER_INFO: Record<RiskTier, RiskTierInfo> = {
  low: {
    tier: "low",
    label: "Low risk",
    note: "Internal, reversible work — mistakes are cheap and easy to undo. Most steps are safe to leave to the AI.",
    guidance:
      "This is a LOW-RISK workflow: the output stays internal and any mistake is cheap and reversible. At most ONE step genuinely needs a human — include 0-1 critical steps. Make every other step plainly safe to automate, and plant 1 trap (a step that sounds important but whose impact line shows it is reversible/internal). The lesson is that not every step needs a checkpoint.",
  },
  medium: {
    tier: "medium",
    label: "Medium risk",
    note: "Decisions start to reach other people. Some steps must be checked before they go ahead; others are still fine to automate.",
    guidance:
      "This is a MEDIUM-RISK workflow: some actions reach colleagues, customers or records and would be awkward to walk back. Include 1-2 critical steps (an action that is hard to reverse or that judges a person/submission) and 1-2 traps that look risky but whose impact line shows they are reversible or low-stakes. Keep one or two plainly-safe steps too.",
  },
  high: {
    tier: "high",
    label: "High risk",
    note: "Irreversible, high-stakes calls about money or people. A bad automated decision here is a real liability — but bogging the whole thing down in sign-offs is its own failure.",
    guidance:
      "This is a HIGH-RISK workflow: it touches money, livelihoods or legally-sensitive judgements, and some actions cannot be undone. Include 2-3 critical steps where a human MUST sign off before the action takes effect. Also plant 2-3 traps — steps whose stakes feel high so the player is tempted to add a checkpoint, but whose impact line reveals they are reversible drafts or internal-only — so the player must resist checkpointing the whole pipeline.",
  },
};

export function tierInfoForDifficulty(difficulty: number): RiskTierInfo {
  return RISK_TIER_INFO[tierForDifficulty(difficulty)];
}
