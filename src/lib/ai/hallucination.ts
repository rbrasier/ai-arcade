import { z } from "zod";

import { generateJson, isConfigured } from "./connector";
import { mockHallucinationRound } from "./hallucination-mock";

/**
 * "Spot the Hallucination" generates a fresh, chat-style scenario for each of
 * the game's five rounds. A workplace assistant answers a task; the answer is
 * split into discrete claims, some of which are fabricated. The reasoning steps
 * are shown too — and at higher difficulty a clue to a fabrication may be
 * buried there rather than in the answer itself.
 */

export interface HallucinationClaim {
  id: string;
  text: string;
  /** Ground truth — never sent to the client before scoring. */
  hallucination: boolean;
}

export interface HallucinationScenario {
  /** The "boss" direct message that kicks off the task. */
  task: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  /** File names the user "attached" for the assistant. */
  attachments: string[];
  /** The user's prompt to the assistant. */
  promptText: string;
  /** Collapsible reasoning lines; a fabrication clue may hide here. */
  reasoningSteps: string[];
  /** The streamed answer, split into ~5 selectable claims. */
  claims: HallucinationClaim[];
  /** Debrief notes explaining what was true vs. fabricated, and why. */
  explanations: string[];
}

const scenarioSchema = z.object({
  task: z.object({
    senderName: z.string(),
    senderRole: z.string(),
    senderInitials: z.string(),
    message: z.string(),
  }),
  attachments: z.array(z.string()).min(1).max(4),
  promptText: z.string(),
  reasoningSteps: z.array(z.string()).min(2).max(6),
  claims: z
    .array(
      z.object({
        text: z.string(),
        hallucination: z.boolean(),
      }),
    )
    .min(4)
    .max(6),
  explanations: z.array(z.string()).min(1).max(5),
});

const SYSTEM_PROMPT = `You generate training scenarios for "Spot the Hallucination", a game that teaches people to catch fabricated claims in AI output.

You produce a realistic workplace scenario: a colleague forwards a task, the user asks a work assistant for help with attached files, and the assistant produces a short, confident, cited answer. The answer is split into 4-6 discrete claims. SOME claims are fabricated ("hallucinated"), some are sound.

Plant 0-3 hallucinations per scenario (vary the count; occasionally zero). Use a MIX of these hallucination types across rounds:
- A misspelled proper noun — a person's or organisation's name spelled wrong.
- A fabricated or oddly over-precise statistic (e.g. "exactly 91.4%").
- A citation to a source/report that was never provided.
- A claim that contradicts something stated in the reasoning steps — i.e. the clue is BURIED IN THE REASONING, not the answer.

Difficulty 1 = blatant and obvious. Difficulty 5 = subtle, plausible-sounding, and more likely to hide the clue in the reasoning. Scale subtlety with the difficulty given.

Rules:
- "hallucination: true" marks a fabricated claim; mark sound claims false.
- Make claims read as one flowing answer when concatenated in order.
- "explanations" must justify each fabricated claim (and note any tricky-but-true claim a player might wrongly flag).
- Keep it grounded, professional, and varied across rounds (different industries/topics).`;

/** Generate a round at the given difficulty (1-5). Falls back to a mock bank. */
export async function generateHallucinationRound(
  difficulty: number,
): Promise<HallucinationScenario> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));

  if (!isConfigured()) {
    return mockHallucinationRound(d);
  }

  try {
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one scenario at difficulty ${d} of 5. Pick a fresh, recognisable workplace topic. Decide how many claims (4-6) and how many are fabricated (0-3, your choice). Remember to vary the hallucination type and, at higher difficulty, sometimes bury the clue in the reasoning steps.`,
      maxOutputTokens: 2048,
    });
    return withClaimIds(raw);
  } catch {
    return mockHallucinationRound(d);
  }
}

/** Attach stable ids to claims (the model only returns text + flag). */
export function withClaimIds(
  raw: Omit<HallucinationScenario, "claims"> & {
    claims: { text: string; hallucination: boolean }[];
  },
): HallucinationScenario {
  return {
    ...raw,
    claims: raw.claims.map((c, i) => ({
      id: `c${i + 1}`,
      text: c.text,
      hallucination: c.hallucination,
    })),
  };
}
