import { z } from "zod";

import { tierInfoForDifficulty } from "@/lib/hallucination-tiers";
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
  /**
   * Short topic label for this scenario (e.g. "customer churn", "warehouse
   * safety"). Used to keep the five rounds of a play-through on distinct themes.
   */
  topic: string;
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
  topic: z.string(),
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

You produce a realistic workplace scenario: a colleague forwards a task, the user asks a work assistant for help with attached files, and the assistant produces a short, confident, cited answer. The answer is split into 4-6 discrete claims. Some claims may be fabricated ("hallucinated"), some are sound.

The game frames each round as the answer from a different MODEL TIER, from a small/quick model up to a frontier model. The teaching point is accurate, not cynical: fabrication risk falls as the model gets more capable. So follow the per-round tier guidance for HOW MANY fabrications to plant and HOW OBVIOUS they are — a frontier round is often perfectly sound, and the player is meant to learn not to over-flag a strong model.

When you do plant a fabrication, use one of these types (vary them across rounds):
- A misspelled proper noun — a person's or organisation's name spelled wrong.
- A fabricated or oddly over-precise statistic (e.g. "exactly 91.4%").
- A citation to a source/report that was never provided.
- A claim that contradicts something stated in the reasoning steps — i.e. the clue is BURIED IN THE REASONING, not the answer.

IMPORTANT — leave a clue. Every fabrication must be catchable from what's on screen: it should clash with an attachment, the reasoning steps, or basic real-world knowledge. Never plant a fabrication that a careful reader has no way to detect.

Rules:
- "topic": a 1-4 word label for the scenario's subject (e.g. "customer churn", "warehouse safety").
- The forwarding colleague's "senderName" and "senderRole" must FIT THIS SPECIFIC scenario's domain (a warehouse-safety brief comes from an operations or H&S lead; a churn analysis from a customer-success manager) and must vary from round to round — never reuse a stock name. Set "senderInitials" to their two initials.
- "hallucination: true" marks a fabricated claim; mark sound claims false.
- Make claims read as one flowing answer when concatenated in order.
- "explanations" must justify each fabricated claim (and note any tricky-but-true claim a player might wrongly flag). If there are zero fabrications, say so and explain why every claim is sound.
- Keep it grounded, professional, and varied across rounds (different industries/topics).`;

/**
 * Generate a round at the given difficulty (1-5). Falls back to a mock bank.
 * `opts.avoidTopics` lists topics already used earlier in the play-through so
 * the five rounds stay on distinct themes.
 */
export async function generateHallucinationRound(
  difficulty: number,
  opts: { avoidTopics?: string[] } = {},
): Promise<HallucinationScenario> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  const tier = tierInfoForDifficulty(d);

  if (!isConfigured()) {
    return mockHallucinationRound(d);
  }

  const avoid = (opts.avoidTopics ?? []).filter(Boolean);
  const avoidNote = avoid.length
    ? ` Do NOT reuse any of these already-used topics (pick a clearly different industry/subject): ${avoid.join("; ")}.`
    : "";

  try {
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one scenario for round ${d} of 5, presented as the "${tier.label}" model tier (${tier.modelName}). ${tier.fabricationGuidance} Pick a fresh, recognisable workplace topic and set "topic" to a short label for it.${avoidNote} Decide how many claims (4-6). Make every fabrication you plant catchable from the attachments, the reasoning, or common knowledge.`,
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
