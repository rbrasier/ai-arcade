/**
 * Pure, dependency-free scoring helpers for "Fit for Purpose" (Right Tool for the
 * Job). Imports nothing from the AI connector or the server runtime so it can be
 * shared by BOTH the scoring route (server) and any client-side preview — the
 * displayed maths and the awarded score come from the same model.
 *
 * The game teaches a single decision: given one workflow step's characteristics —
 * VOLUME, the manual time it takes, its RISK (cost when it goes wrong),
 * VARIABILITY and STRUCTURE — pick the intervention with the best NET VALUE, not
 * the most sophisticated one. The four interventions are `manual` (do nothing new),
 * `rules`, `llm` and `custom-app`. Each carries hidden ground-truth cost params; a
 * deterministic cost model turns them into an annual cost, and the choice is graded
 * on how close it lands to the cheapest option.
 *
 * Scoring model (see docs/GAME-RULES.md):
 *
 *   annualCost(opt) = buildCost/AMORTISE_YEARS         // one-off build, amortised
 *                   + annualMaintenance                // ongoing upkeep / API
 *                   + errorRate * volume * riskCost    // simulated failure cost
 *                   + residualMinutes * volume * MIN   // human labour still needed
 *
 *   regret     = annualCost(chosen) − annualCost(best)        // £ wasted vs optimal
 *   scoreRatio = clamp(1 − regret / annualCost(manual), 0, 1) // regret as a share
 *                                                             // of the job's cost
 *
 * `manual` is the status-quo baseline (the "drag cost of doing nothing"), so its
 * annual cost is the natural scale for how much a mis-pick wastes. The best option
 * scores 1.0; an over-build at low volume or an under-build at high volume drives
 * regret past the baseline and the round fails. Picking the single cheapest option
 * is `exceptional`.
 */

export type Intervention = "manual" | "rules" | "llm" | "custom-app";

/** Power/sophistication order — used only to label an over- vs under-build. */
export const INTERVENTION_RANK: Record<Intervention, number> = {
  manual: 0,
  rules: 1,
  llm: 2,
  "custom-app": 3,
};

/** £ of staff time per minute (~£45/hr). */
export const MINUTE_COST = 0.75;
/** One-off build spread over this many years. */
export const AMORTISE_YEARS = 3;
/** Clear line, shared across the arcade (mirrors CLEAR_THRESHOLD in progress.ts). */
export const CLEAR_THRESHOLD = 0.65;

/** Hidden ground truth for one intervention option. Never sent to the client. */
export interface OptionParams {
  intervention: Intervention;
  /** One-off £ to build/commission it (manual = 0). */
  buildCost: number;
  /** Ongoing £/yr to run it — upkeep, licences, API spend (manual = 0). */
  annualMaintenance: number;
  /** Probability a single run goes wrong after this intervention (0..1). */
  errorRate: number;
  /** Human minutes still needed per run (manual = the full manual time). */
  residualMinutesPerRun: number;
}

/** The revealed characteristics of the step the player is judging. */
export interface StepCharacteristics {
  /** How many times this step runs in a year. */
  volumePerYear: number;
  /** Minutes a human spends on one run today. */
  manualMinutesPerRun: number;
  /** £ cost when this step goes wrong once. */
  riskCostPerFailure: number;
  variability: "identical" | "some" | "high";
  structure: "structured" | "semi" | "free";
}

/** Annual cost of one option under a step's characteristics. Lower is better. */
export function annualCostFor(
  opt: OptionParams,
  char: StepCharacteristics,
): number {
  const amortisedBuild = opt.buildCost / AMORTISE_YEARS;
  const failureCost = opt.errorRate * char.volumePerYear * char.riskCostPerFailure;
  const residualLabour =
    opt.residualMinutesPerRun * char.volumePerYear * MINUTE_COST;
  return amortisedBuild + opt.annualMaintenance + failureCost + residualLabour;
}

/** The cost breakdown for one option, for the debrief table. */
export interface OptionBreakdown {
  intervention: Intervention;
  amortisedBuild: number;
  annualMaintenance: number;
  failureCost: number;
  residualLabour: number;
  annualCost: number;
  /** annualCost(manual) − annualCost(this) — value of acting vs doing nothing. */
  savings: number;
  isBest: boolean;
}

export interface GradedChoice {
  scoreRatio: number;
  exceptional: boolean;
  /** The intervention the cost model says is cheapest. */
  bestIntervention: Intervention;
  chosen: Intervention;
  /** "right" | "over-built" | "under-built" relative to the best option. */
  verdict: "right" | "over-built" | "under-built";
  /** £ the choice wastes per year versus the optimal option. */
  regret: number;
  options: OptionBreakdown[];
}

/**
 * Grade the player's single intervention pick against the step's hidden option
 * params. Pure: the route and any preview both call this so the shown maths
 * matches the awarded score.
 */
export function gradeChoice(
  options: OptionParams[],
  characteristics: StepCharacteristics,
  chosen: Intervention,
): GradedChoice {
  const costs = options.map((o) => ({
    opt: o,
    cost: annualCostFor(o, characteristics),
  }));

  const manual = costs.find((c) => c.opt.intervention === "manual");
  // Manual is the baseline scale; fall back to the dearest option if (somehow)
  // absent so the maths never divides by zero.
  const baseline = manual
    ? manual.cost
    : Math.max(...costs.map((c) => c.cost));

  const bestCost = Math.min(...costs.map((c) => c.cost));
  const best = costs.find((c) => Math.abs(c.cost - bestCost) < 1e-6)!;
  const chosenEntry =
    costs.find((c) => c.opt.intervention === chosen) ?? best;

  const regret = Math.max(0, chosenEntry.cost - bestCost);
  const scoreRatio =
    baseline > 0 ? Math.max(0, Math.min(1, 1 - regret / baseline)) : 1;
  const exceptional = Math.abs(chosenEntry.cost - bestCost) < 1e-6;

  const verdict: GradedChoice["verdict"] = exceptional
    ? "right"
    : INTERVENTION_RANK[chosen] > INTERVENTION_RANK[best.opt.intervention]
      ? "over-built"
      : "under-built";

  const options_: OptionBreakdown[] = costs.map((c) => ({
    intervention: c.opt.intervention,
    amortisedBuild: c.opt.buildCost / AMORTISE_YEARS,
    annualMaintenance: c.opt.annualMaintenance,
    failureCost:
      c.opt.errorRate *
      characteristics.volumePerYear *
      characteristics.riskCostPerFailure,
    residualLabour:
      c.opt.residualMinutesPerRun *
      characteristics.volumePerYear *
      MINUTE_COST,
    annualCost: c.cost,
    savings: baseline - c.cost,
    isBest: Math.abs(c.cost - bestCost) < 1e-6,
  }));

  return {
    scoreRatio,
    exceptional,
    bestIntervention: best.opt.intervention,
    chosen,
    verdict,
    regret,
    options: options_,
  };
}
