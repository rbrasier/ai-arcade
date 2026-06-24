import { z } from "zod";

import { pickRound } from "@/lib/rounds/bank";

import { generateJson, generatePlainText, isConfigured } from "./connector";
import { mockRightToolRound } from "./right-tool-for-the-job-mock";
import { tierInfoForDifficulty, type ToolTier } from "../right-tool-tiers";
import type {
  GradedChoice,
  Intervention,
  OptionParams,
  StepCharacteristics,
} from "../right-tool-for-the-job-scoring";

/**
 * "Fit for Purpose" (Right Tool for the Job) generates a single workflow step per
 * round, with its revealed characteristics and the hidden cost params for all four
 * interventions. The player picks one intervention; a deterministic cost model
 * (see right-tool-for-the-job-scoring.ts) decides the net-value winner.
 *
 * The teaching point is "net value, not sophistication": match the tool to the
 * step's volume / variability / risk / structure, and weigh build + maintenance +
 * failure costs against the drag of doing nothing. Difficulty shapes each round so
 * a different tool wins and both over-building and under-building bite (see
 * right-tool-tiers.ts).
 */

/** The four interventions, in display order, with the copy the client shows. */
export const INTERVENTIONS: { intervention: Intervention; label: string; blurb: string }[] = [
  {
    intervention: "manual",
    label: "Leave it manual",
    blurb: "Keep doing it by hand. No build, no upkeep — you just keep paying the time.",
  },
  {
    intervention: "rules",
    label: "Rules-based automation",
    blurb: "A deterministic script/filter. Cheap and reliable on clean, predictable inputs; brittle on messy ones.",
  },
  {
    intervention: "llm",
    label: "Use an LLM",
    blurb: "A model handles it. Flexible on messy language; ongoing per-use cost and some error rate.",
  },
  {
    intervention: "custom-app",
    label: "Commission a custom app",
    blurb: "IT builds a tailored application. Highest capability and lowest error — but a big up-front build.",
  },
];

export interface RightToolScenario {
  /** Short topic label (e.g. "docket re-keying") — keeps rounds distinct. */
  topic: string;
  /** Difficulty tier (1-5), derived from difficulty. */
  tier: ToolTier;
  /** The colleague handing over the decision (styled like a direct message). */
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  /** One precise sentence naming what the player must decide. */
  goal: string;
  /** Short imperative title of the step under review. */
  stepTitle: string;
  /** One sentence describing what the step does today. */
  stepDetail: string;
  /** The revealed characteristics the player reasons from. */
  characteristics: StepCharacteristics;
  /** Hidden ground truth — the cost params for all four interventions. */
  options: OptionParams[];
  /** Debrief note — why the right tool wins and the others don't. */
  explanation: string;
}

const optionSchema = z.object({
  intervention: z.enum(["manual", "rules", "llm", "custom-app"]),
  buildCost: z.number().min(0),
  annualMaintenance: z.number().min(0),
  errorRate: z.number().min(0).max(1),
  residualMinutesPerRun: z.number().min(0),
});

const scenarioSchema = z.object({
  topic: z.string(),
  brief: z.object({
    senderName: z.string(),
    senderRole: z.string(),
    senderInitials: z.string(),
    message: z.string(),
  }),
  goal: z.string(),
  stepTitle: z.string(),
  stepDetail: z.string(),
  characteristics: z.object({
    volumePerYear: z.number().positive(),
    manualMinutesPerRun: z.number().positive(),
    riskCostPerFailure: z.number().min(0),
    variability: z.enum(["identical", "some", "high"]),
    structure: z.enum(["structured", "semi", "free"]),
  }),
  options: z.array(optionSchema).length(4),
  explanation: z.string(),
});

export type RawRightToolScenario = z.infer<typeof scenarioSchema>;

const SYSTEM_PROMPT = `You generate rounds for "Fit for Purpose", a game that teaches people to MATCH AN INTERVENTION TO A WORKFLOW STEP on NET VALUE, not on sophistication. The lesson cuts both ways: reaching for a fancy build on a tiny job wastes money (over-building), but leaving a huge, repetitive job manual quietly bleeds cost all year (under-building). Sometimes the right answer is to build nothing.

Each round is ONE realistic workplace step. The player reads its characteristics and picks ONE of four interventions: "manual" (keep doing it by hand), "rules" (a deterministic script/filter), "llm" (a model does it), or "custom-app" (IT commissions a tailored application).

You must output the step PLUS the hidden cost parameters for ALL FOUR interventions, so a deterministic cost model can decide the winner. The model computes, per option:
  annualCost = buildCost/3 + annualMaintenance + errorRate*volumePerYear*riskCostPerFailure + residualMinutesPerRun*volumePerYear*0.75
(0.75 = £ per staff-minute; build is amortised over 3 years). Lower annual cost is better; the cheapest option is the intended answer.

Fields:
- "topic": a 1-4 word label for the step's subject.
- "brief": the colleague handing over the decision — "senderName", a "senderRole" job title, two-letter "senderInitials", and a short natural "message" asking which tool to use. The name AND role must FIT this step's domain and vary round to round — never a recurring stock person.
- "goal": one sentence naming the decision (e.g. "Choose the best-value way to handle this step.").
- "stepTitle" + "stepDetail": the step and what it does today.
- "characteristics": "volumePerYear" (how many times/yr), "manualMinutesPerRun" (human minutes per run today), "riskCostPerFailure" (£ when one run goes wrong), "variability" (identical | some | high), "structure" (structured | semi | free).
- "options": EXACTLY four, one per intervention. For "manual": buildCost 0, annualMaintenance 0, residualMinutesPerRun = the full manualMinutesPerRun, and a realistic human errorRate. For the others: a one-off "buildCost", an "annualMaintenance" (upkeep/licences/API spend — make the LLM's scale with volume), an "errorRate" after that intervention, and the "residualMinutesPerRun" a human still spends.
- "explanation": one short paragraph for the debrief — name the winning tool, say why it wins on net value, and call out the tempting wrong option (the over- or under-build trap).

Rules:
- The intended winner must be inferable from the characteristics: high volume of clean structured work favours cheap rules; free text / high variability favours an LLM; very low volume favours leaving it manual (no build repays); high volume AND high risk AND messy favours a custom app.
- Make the numbers internally consistent so the cost model genuinely makes the intended option cheapest and the trap option clearly worse. Use realistic figures.
- Keep steps grounded, professional and varied across rounds (different industries), each with its own fitting sender.`;

/** Ensure the four interventions are present and in canonical order. */
export function normaliseScenario(
  raw: RawRightToolScenario,
  tier: ToolTier,
): RightToolScenario {
  const order: Intervention[] = ["manual", "rules", "llm", "custom-app"];
  const byKind = new Map(raw.options.map((o) => [o.intervention, o]));
  const options: OptionParams[] = order.map(
    (k) =>
      byKind.get(k) ?? {
        intervention: k,
        buildCost: 0,
        annualMaintenance: 0,
        errorRate: 0.05,
        residualMinutesPerRun:
          k === "manual" ? raw.characteristics.manualMinutesPerRun : 0,
      },
  );
  return {
    topic: raw.topic,
    tier,
    brief: raw.brief,
    goal: raw.goal,
    stepTitle: raw.stepTitle,
    stepDetail: raw.stepDetail,
    characteristics: raw.characteristics,
    options,
    explanation: raw.explanation,
  };
}

/**
 * Generate a round at the given difficulty (1-5). Falls back to a deterministic
 * mock bank when no AI provider is configured (or on error). `opts.avoidTopics`
 * lists topics already used earlier in the play-through so the five rounds stay
 * distinct.
 */
export async function generateRightToolRound(
  difficulty: number,
  opts: { avoidTopics?: string[]; fromBank?: boolean } = {},
): Promise<RightToolScenario> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));

  // Prefer a pre-generated round from the static bank (see src/lib/rounds).
  if (opts.fromBank !== false) {
    const picked = pickRound<RightToolScenario>("right-tool-for-the-job", d, {
      avoidTopics: opts.avoidTopics,
    });
    if (picked) return picked;
  }
  const tier = tierInfoForDifficulty(d);

  if (!isConfigured()) {
    return mockRightToolRound(d);
  }

  const avoid = (opts.avoidTopics ?? []).filter(Boolean);
  const avoidNote = avoid.length
    ? ` Do NOT reuse any of these already-used topics (pick a clearly different subject): ${avoid.join("; ")}.`
    : "";

  try {
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one "Fit for Purpose" round at difficulty ${d} of 5. ${tier.guidance} Set "topic" to a short label for the step.${avoidNote} Make the numbers consistent so the cost model makes the intended tool genuinely cheapest and the trap clearly worse.`,
      maxOutputTokens: 1536,
    });
    return normaliseScenario(raw, tier.tier);
  } catch {
    return mockRightToolRound(d);
  }
}

/**
 * Narrate a year of running the step with the player's chosen tool, so the
 * scorecard shows what their decision produced — money saved or wasted, errors
 * caught or let through (the same "what it produced" idea as Prompt Golf). Fed the
 * computed metrics so prose and numbers agree. Illustrative only; the score is
 * graded deterministically from the cost model, not this text. Falls back to a
 * deterministic stand-in when no provider is configured (or on error).
 */
export async function generateRightToolOutcome(args: {
  scenario: RightToolScenario;
  chosen: Intervention;
  graded: GradedChoice;
}): Promise<string> {
  const { scenario, chosen, graded } = args;

  if (!isConfigured()) {
    return mockRightToolOutcome(scenario, chosen, graded);
  }

  const chosenBreak = graded.options.find((o) => o.intervention === chosen);
  const bestBreak = graded.options.find((o) => o.isBest);
  const label = (k: Intervention) =>
    INTERVENTIONS.find((i) => i.intervention === k)?.label ?? k;

  try {
    return await generatePlainText({
      system:
        "You narrate one year of running a single workplace step with a chosen tool, to show the consequences of that choice in plain money-and-time terms. In 2-4 grounded sentences: if the choice was the best-value one, say it paid off and why; if it over-built (a fancy tool on a small job), show the wasted build cost; if it under-built (left a huge job manual or used brittle rules on messy input), show the cost or errors that piled up across the year. Be concrete with the figures you are given; do not lecture.",
      prompt: `Step: ${scenario.stepTitle} — ${scenario.stepDetail}\nVolume: ${Math.round(scenario.characteristics.volumePerYear).toLocaleString("en-GB")}/yr · risk £${scenario.characteristics.riskCostPerFailure}/failure · variability ${scenario.characteristics.variability} · structure ${scenario.characteristics.structure}\n\nPlayer chose: ${label(chosen)} (annual cost ≈ £${Math.round(chosenBreak?.annualCost ?? 0).toLocaleString("en-GB")}).\nBest-value option: ${label(graded.bestIntervention)} (annual cost ≈ £${Math.round(bestBreak?.annualCost ?? 0).toLocaleString("en-GB")}).\nVerdict: ${graded.verdict}. Money wasted vs best ≈ £${Math.round(graded.regret).toLocaleString("en-GB")}/yr.`,
      maxOutputTokens: 300,
    });
  } catch {
    return mockRightToolOutcome(scenario, chosen, graded);
  }
}

/** Deterministic stand-in narration for the offline / mock path. */
function mockRightToolOutcome(
  scenario: RightToolScenario,
  chosen: Intervention,
  graded: GradedChoice,
): string {
  const label = (k: Intervention) =>
    INTERVENTIONS.find((i) => i.intervention === k)?.label ?? k;
  const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
  const regret = gbp(graded.regret);

  if (graded.verdict === "right") {
    return `Over the year, ${label(chosen).toLowerCase()} handled "${scenario.stepTitle}" at the lowest net cost of any option — the spend was right-sized to the ${Math.round(scenario.characteristics.volumePerYear).toLocaleString("en-GB")}-a-year volume, and nothing was wasted on capability the job didn't need. The right tool for the job.`;
  }
  if (graded.verdict === "over-built") {
    return `${label(chosen)} worked, but it was overkill: the build and upkeep cost about ${regret} a year more than the best-value option, because the volume here was never enough to repay that much capability. The smarter move was to spend less — sometimes the right call is to build little or nothing.`;
  }
  return `${label(chosen)} left value on the table: across the year it cost roughly ${regret} more than the best option — too little capability for a step this size, so manual time or avoidable errors piled up. A step this big repays a proper tool.`;
}
