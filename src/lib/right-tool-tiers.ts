/**
 * Round shaping for "Fit for Purpose" (Right Tool for the Job).
 *
 * The five rounds escalate the judgment, exactly as the Act Three learning
 * outcome frames it ("match the intervention to a step's volume / variability /
 * risk / structure; weigh build, maintenance and failure costs against the cost
 * of inaction; resist AI-solutionism"). Each round is rigged so a different tool
 * is the right answer, and the two failure modes — over-building a tiny job and
 * under-building a huge one — both bite.
 *
 * Pure and dependency-free so it can be shared by the client, the generator and
 * the scoring/route code alike.
 */

export type ToolTier = 1 | 2 | 3 | 4 | 5;

export interface ToolTierInfo {
  tier: ToolTier;
  /** Short badge label shown on the round. */
  label: string;
  /** One-line framing used in copy and the round intro. */
  note: string;
  /** Guidance handed to the generator about how to shape the round. */
  guidance: string;
}

export function tierForDifficulty(difficulty: number): ToolTier {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return d as ToolTier;
}

export const TOOL_TIER_INFO: Record<ToolTier, ToolTierInfo> = {
  1: {
    tier: 1,
    label: "Warm-up",
    note: "A clean, repetitive, structured step at decent volume — there is an obvious right-sized tool, and a comically oversized wrong one.",
    guidance:
      "WARM-UP round. Pick a high-volume (say 8,000–15,000/yr), perfectly STRUCTURED, IDENTICAL-every-time, LOW-RISK step (e.g. copying form fields into a system). A simple RULES-based automation should be clearly the cheapest option and the right answer. Make `manual` plainly wasteful at this volume, `llm` an unnecessary-but-not-crazy second, and `custom-app` an absurd over-build whose amortised cost dwarfs the tiny labour saved. The lesson: match the tool, don't reach for the fanciest.",
  },
  2: {
    tier: 2,
    label: "Free text",
    note: "The work is unstructured language. Keyword rules quietly break on it; the flexible tool earns its keep.",
    guidance:
      "FREE-TEXT round. Pick a mid/high-volume step (say 40,000–80,000/yr) whose input is FREE TEXT with SOME variability (e.g. routing inbound emails, tagging feedback). An LLM should be the cheapest option. Rig RULES to look tempting and cheap to build but carry a HIGH error rate on the messy text (so its failure cost makes it as bad as doing nothing) — the under-power trap. `custom-app` should also work but cost a little more than the LLM; `manual` should be too slow at this volume. The lesson: rules break on language; reach for the model.",
  },
  3: {
    tier: 3,
    label: "Resist the shiny option",
    note: "Low volume, real human time per run — but so few runs a year that no build ever pays back. The exciting custom app is the trap.",
    guidance:
      "OVER-BUILD TRAP round. Pick a LOW-VOLUME step (say 60–200/yr) that still takes real human minutes per run (e.g. a monthly bespoke report). Rig it so `manual` is genuinely the cheapest because the volume can NEVER repay any build cost. Make `custom-app` the shiny trap — a big one-off build whose amortised cost massively exceeds a year of manual labour — and make `rules` and `llm` also LOSE money versus doing nothing (their amortised build + upkeep beat the small labour saved). The lesson: sometimes the right move is to build nothing.",
  },
  4: {
    tier: 4,
    label: "Don't under-build",
    note: "Enormous volume of clean, repetitive work. Leaving it manual quietly bleeds cost all year; this one demands automation.",
    guidance:
      "UNDER-BUILD TRAP round. Pick a VERY HIGH-VOLUME (say 150,000–400,000/yr), STRUCTURED, IDENTICAL step (e.g. re-keying scanned dockets). Rig it so `manual` is by far the WORST option — a year of labour at that volume is a fortune — and a RULES automation is the cheapest, easily repaying its build. `custom-app` should also clearly pay back (a fine second); make `llm` carry heavy per-call API maintenance at this volume so it is the weakest of the automations. The lesson: under-intervening on a high-volume step is its own expensive failure.",
  },
  5: {
    tier: 5,
    label: "Boss round",
    note: "High volume, high stakes, messy and varied. Only a purpose-built application is reliable enough to be worth it.",
    guidance:
      "BOSS round. Pick a HIGH-VOLUME (say 60,000–100,000/yr), HIGH-RISK (a wrong call costs hundreds of £), HIGH-VARIABILITY, FREE-TEXT step (e.g. fraud-screening claims). Rig it so a COMMISSIONED CUSTOM-APP is genuinely the cheapest because its low error rate tames the large risk×volume failure cost. Make `rules` catastrophic (high error rate × high risk makes it cost MORE than doing nothing), `manual` too slow and error-prone, and a plain `llm` a defensible-but-clearly-second option (clears, but its error rate leaves real failure cost on the table). The lesson: when stakes and volume are both high, a real build pays for itself.",
  },
};

export function tierInfoForDifficulty(difficulty: number): ToolTierInfo {
  return TOOL_TIER_INFO[tierForDifficulty(difficulty)];
}
