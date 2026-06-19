import { z } from "zod";

import { generateJson, isConfigured } from "./connector";
import { mockEvaluatePromptGolf, mockPromptGolfRound } from "./prompt-golf-mock";

/**
 * "Prompt Golf" generates a fresh corporate scenario for each of the game's
 * five rounds. A colleague forwards a real-world situation; the player must
 * write the *shortest* prompt that would make an AI produce an output meeting
 * every listed criterion — without losing intent. They are scored on
 * **precision** (did the prompt cover every criterion) and **word economy**
 * (how close to / under par the prompt is). Difficulty escalates: more
 * interacting constraints and a tighter par at the higher rounds.
 */

export interface PromptGolfCriterion {
  id: string;
  /** A single requirement the player's prompt must make the AI satisfy. */
  text: string;
  /**
   * Lowercase hints used ONLY by the offline mock judge to decide whether a
   * criterion is covered. Never used by the live AI judge, which reasons over
   * the prompt semantically.
   */
  keywords: string[];
}

export interface PromptGolfScenario {
  /** The colleague who forwards the task (styled like a direct message). */
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    /** The situation / what they need, in plain language. */
    message: string;
  };
  /** Short title for the deliverable, e.g. "Project status update". */
  goal: string;
  /** The explicit requirements the player's prompt must satisfy (2-5). */
  criteria: PromptGolfCriterion[];
  /** Target word count for a tight prompt; economy is scored against this. */
  par: number;
  /**
   * "Rewrite" rounds only: a bloated, filler-heavy first-draft prompt
   * (~2-3× par) that already covers the criteria. The player trims it down
   * rather than starting from a blank box. Absent on normal compose rounds.
   */
  messyPrompt?: string;
}

/** Per-criterion judgement returned by the evaluator. */
export interface CriterionResult {
  id: string;
  met: boolean;
  note: string;
}

export interface PromptGolfEvaluation {
  criteria: CriterionResult[];
  /** A one-line overall verdict on the prompt's precision. */
  feedback: string;
}

const scenarioSchema = z.object({
  brief: z.object({
    senderName: z.string(),
    senderRole: z.string(),
    senderInitials: z.string(),
    message: z.string(),
  }),
  goal: z.string(),
  criteria: z
    .array(
      z.object({
        text: z.string(),
        keywords: z.array(z.string()).min(1).max(6),
      }),
    )
    .min(2)
    .max(5),
  par: z.number().int().min(6).max(60),
  messyPrompt: z.string().optional(),
});

const SYSTEM_PROMPT = `You generate rounds for "Prompt Golf", a game that teaches people to write tight, precise prompts with no wasted words.

Each round is a realistic workplace scenario: a colleague forwards a situation, and the player must write the SHORTEST possible prompt that would make an AI produce a deliverable meeting every requirement — without losing intent.

You produce:
- "brief": the forwarding colleague (name, role, two-letter initials) and a short, natural message describing the situation and what they need.
- "goal": a 2-5 word label for the deliverable (e.g. "Project status update").
- "criteria": 2-5 EXPLICIT, individually-checkable requirements the player's prompt must make the AI satisfy (e.g. "exactly 3 bullet points", "identifies the core problem", "proposes a concrete next step", "professional tone", "no preamble"). Each criterion also has 1-6 lowercase "keywords" — the words/synonyms a good prompt would contain for that requirement (used only for offline grading).
- "par": the target word count for a tight prompt that covers every criterion. Be realistic — roughly 4-9 words per criterion.

Difficulty 1 = two simple, independent criteria and a generous par. Difficulty 5 = four or five interacting constraints (format + content + tone + an exclusion or edge case) and a tight par. Scale the number of criteria and how demanding they are with the difficulty given.

Rules:
- Criteria must be objective and checkable, not vague.
- Keep scenarios grounded, professional and varied across rounds (different industries/topics).
- Par should be achievable: a sharp prompt covering all criteria should fit within it.`;

/** Attach stable ids to criteria (the model only returns text + keywords). */
export function withCriterionIds(
  raw: Omit<PromptGolfScenario, "criteria"> & {
    criteria: { text: string; keywords: string[] }[];
  },
): PromptGolfScenario {
  return {
    ...raw,
    criteria: raw.criteria.map((c, i) => ({
      id: `k${i + 1}`,
      text: c.text,
      keywords: c.keywords.map((k) => k.toLowerCase()),
    })),
  };
}

/**
 * Generate a round at the given difficulty (1-5). Falls back to a mock bank.
 * On a "rewrite" round (`opts.rewrite`), the scenario also carries a bloated
 * `messyPrompt` for the player to trim instead of writing from scratch.
 */
export async function generatePromptGolfRound(
  difficulty: number,
  opts: { rewrite?: boolean } = {},
): Promise<PromptGolfScenario> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));

  if (!isConfigured()) {
    return mockPromptGolfRound(d, opts.rewrite);
  }

  try {
    const rewriteNote = opts.rewrite
      ? ` This is a REWRITE round: also include "messyPrompt" — a bloated, rambling first-draft prompt of roughly 2-3× par words that technically covers every criterion but is full of filler, hedging and redundancy for the player to cut down.`
      : "";
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one Prompt Golf scenario at difficulty ${d} of 5. Pick a fresh, recognisable workplace situation. Choose how many criteria (2-5) to match the difficulty, write checkable requirements with keywords, and set a realistic par word count.${rewriteNote}`,
      maxOutputTokens: 1536,
    });
    const scenario = withCriterionIds(raw);
    // If a rewrite round somehow came back without a draft, fall back to the
    // mock's draft so the round still works as a rewrite.
    if (opts.rewrite && !scenario.messyPrompt) {
      scenario.messyPrompt = mockPromptGolfRound(d, true).messyPrompt;
    }
    return scenario;
  } catch {
    return mockPromptGolfRound(d, opts.rewrite);
  }
}

const evaluationSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.string(),
      met: z.boolean(),
      note: z.string(),
    }),
  ),
  feedback: z.string(),
});

const JUDGE_SYSTEM = `You are the judge for "Prompt Golf". A player has written a prompt that is meant to make an AI produce a deliverable meeting a fixed list of criteria. Decide, for EACH criterion, whether the player's prompt would reliably cause an AI to satisfy it.

Judge intent and instruction, not output: the player wrote a prompt, not the deliverable itself. A criterion is "met" only if the prompt clearly and unambiguously instructs for it (explicitly or through obvious, standard phrasing). Vague or missing instructions are NOT met. Do not give credit for things the prompt merely implies loosely.

Return one entry per criterion (echo its id), with "met" and a terse "note" explaining the call, plus a one-line overall "feedback".`;

/**
 * Judge a player's prompt against a scenario's criteria. Uses the AI connector
 * when configured; otherwise (or on error) falls back to a deterministic
 * keyword heuristic so the game is fully playable offline.
 */
export async function evaluatePromptGolfSubmission(input: {
  scenario: PromptGolfScenario;
  prompt: string;
}): Promise<PromptGolfEvaluation> {
  const { scenario, prompt } = input;

  if (!isConfigured()) {
    return mockEvaluatePromptGolf(scenario, prompt);
  }

  try {
    const criteriaList = scenario.criteria
      .map((c) => `- (${c.id}) ${c.text}`)
      .join("\n");
    const raw = await generateJson(evaluationSchema, {
      system: JUDGE_SYSTEM,
      prompt: `Deliverable: ${scenario.goal}\n\nCriteria:\n${criteriaList}\n\nPlayer's prompt:\n"""\n${prompt}\n"""\n\nJudge each criterion by id.`,
      maxOutputTokens: 1024,
    });
    // Re-anchor to the real criteria ids/order so scoring is robust to a model
    // that drops, reorders or invents ids.
    const byId = new Map(raw.criteria.map((c) => [c.id, c]));
    const criteria: CriterionResult[] = scenario.criteria.map((c) => {
      const got = byId.get(c.id);
      return {
        id: c.id,
        met: got?.met ?? false,
        note: got?.note ?? "Not addressed by the prompt.",
      };
    });
    return { criteria, feedback: raw.feedback };
  } catch {
    return mockEvaluatePromptGolf(scenario, prompt);
  }
}

/** Count words consistently (whitespace split, empties dropped). */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
