import { z } from "zod";

import { pickRound } from "@/lib/rounds/bank";

import { generateJson, isConfigured } from "./connector";
import { mockChainOfThoughtRound } from "./chain-of-thought-mock";

/**
 * "Think It Through" generates a fresh multi-step desk task for each of the
 * game's five rounds — the kind of job that used to be done by hand. The player
 * sees a QUICK (non-reasoning) assistant blurt a confident snap answer, decides
 * whether to trust it or make it reason the task out, then watches a step-by-step
 * chain of thought work the task and commits the final answer.
 *
 * The teaching point is the mindset shift: AI can now reason through multi-step
 * work, so the human's job moves from doing the steps to DIRECTING and VERIFYING
 * the reasoning. Lower-difficulty tasks are simple enough that the snap answer is
 * right (don't over-demand working); harder tasks genuinely need the chain, and
 * the snap answer falls for a plausible trap.
 */

export interface ChainOfThoughtOption {
  id: string;
  text: string;
}

export interface ChainOfThoughtScenario {
  /** Short topic label (e.g. "expense policy", "shift rota") — keeps rounds distinct. */
  topic: string;
  /** The colleague who forwards the task (styled like a direct message). */
  task: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    /** The multi-step task plus the data/rules needed to solve it. */
    message: string;
  };
  /** The single precise question to answer. */
  question: string;
  /** 3-4 short answer options the player picks from. */
  options: ChainOfThoughtOption[];
  /** The option the quick assistant blurts. */
  snapAnswerId: string;
  /** The quick assistant's confident one-line answer (no working shown). */
  snapAnswerText: string;
  /** The step-by-step chain of thought, revealed after the trust decision. */
  reasoning: string[];
  /** The option the reasoning lands on — always the correct one. */
  reasonedAnswerId: string;
  // ----- ground truth: never sent to the client before scoring -----
  /** The correct option. */
  correctOptionId: string;
  /** Whether the quick snap answer happened to be correct. */
  snapCorrect: boolean;
  /** Debrief note: the correct answer, and where the snap went wrong (or why it was right). */
  explanation: string;
}

/** Shape the model returns (options as text, answers as indices). */
const scenarioSchema = z.object({
  topic: z.string(),
  task: z.object({
    senderName: z.string(),
    senderRole: z.string(),
    senderInitials: z.string(),
    message: z.string(),
  }),
  question: z.string(),
  options: z.array(z.string()).min(2).max(4),
  snapAnswerIndex: z.number().int().min(0),
  snapAnswerText: z.string(),
  reasoning: z.array(z.string()).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string(),
});

export type RawChainOfThoughtScenario = z.infer<typeof scenarioSchema>;

const SYSTEM_PROMPT = `You generate rounds for "Think It Through", a game that teaches people that modern AI can REASON THROUGH multi-step work that used to be done by hand — and that the player's job is to know when to demand that working and to verify the result.

Each round is a realistic workplace task that takes several steps of reasoning to get right (e.g. reconciling figures against a policy, scheduling around constraints, working out who qualifies under a set of rules, multi-step arithmetic, deducing a conclusion from several facts). There is exactly ONE correct answer.

You produce two things the player compares:
1. A QUICK (non-reasoning) assistant's snap answer — an instant, confident one-liner that picks one of the options without showing any working. On harder tasks this snap answer is WRONG: it skips a step and falls for a plausible trap. On simpler tasks it can be right.
2. A step-by-step CHAIN OF THOUGHT (the "reasoning" array) that works the task one move at a time and lands on the CORRECT option.

Fields:
- "topic": a 1-4 word label for the task's subject (e.g. "expense policy", "shift rota").
- "task": the colleague forwarding the work — a "senderName", a "senderRole" job title and two-letter "senderInitials", plus a short, natural "message" describing the task. The name AND the role must FIT THIS SPECIFIC task's domain (an expense-policy task comes from a finance lead; a shift rota from an operations coordinator) and must vary from round to round — never reuse a stock name. Put EVERY number, rule and constraint the task depends on right in the message, so the task is fully solvable from what's shown.
- "question": the single precise question to answer.
- "options": 3-4 short answer options. Make the wrong ones plausible — at least one must be the trap the quick model falls for. Do not restate an option verbatim inside the reasoning.
- "snapAnswerIndex": the 0-based option the quick assistant blurts.
- "snapAnswerText": the quick assistant's confident one-line answer (no working).
- "reasoning": 2-6 short steps that actually solve the task and reach the correct option; each step is one clear move.
- "correctIndex": the 0-based correct option.
- "explanation": one short paragraph naming the correct answer and saying where the snap answer went wrong (or why it happened to be right).

Difficulty scales the number of steps and how subtle the trap is. Follow the per-round instruction about whether the snap answer should be correct.

Rules:
- The task must be objectively solvable from the information shown, and the correct answer must follow from the reasoning steps.
- Keep tasks grounded, professional and varied across rounds (different industries/subjects).`;

/** Attach stable option ids and derive the ground-truth fields from the indices. */
export function withOptionIds(raw: RawChainOfThoughtScenario): ChainOfThoughtScenario {
  const options: ChainOfThoughtOption[] = raw.options.map((text, i) => ({
    id: `o${i + 1}`,
    text,
  }));
  const clamp = (n: number) => Math.max(0, Math.min(options.length - 1, n));
  const correctOptionId = options[clamp(raw.correctIndex)].id;
  const snapAnswerId = options[clamp(raw.snapAnswerIndex)].id;
  return {
    topic: raw.topic,
    task: raw.task,
    question: raw.question,
    options,
    snapAnswerId,
    snapAnswerText: raw.snapAnswerText,
    reasoning: raw.reasoning,
    reasonedAnswerId: correctOptionId,
    correctOptionId,
    snapCorrect: snapAnswerId === correctOptionId,
    explanation: raw.explanation,
  };
}

/**
 * Generate a round at the given difficulty (1-5). Falls back to a mock bank when
 * no AI provider is configured (or on error). `opts.avoidTopics` lists topics
 * already used earlier in the play-through so the five rounds stay distinct.
 */
export async function generateChainOfThoughtRound(
  difficulty: number,
  opts: { avoidTopics?: string[]; fromBank?: boolean } = {},
): Promise<ChainOfThoughtScenario> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));

  // Prefer a pre-generated round from the static bank (see src/lib/rounds).
  if (opts.fromBank !== false) {
    const picked = pickRound<ChainOfThoughtScenario>("chain-of-thought", d, {
      avoidTopics: opts.avoidTopics,
    });
    if (picked) return picked;
  }

  if (!isConfigured()) {
    return mockChainOfThoughtRound(d);
  }

  const avoid = (opts.avoidTopics ?? []).filter(Boolean);
  const avoidNote = avoid.length
    ? ` Do NOT reuse any of these already-used topics (pick a clearly different subject): ${avoid.join("; ")}.`
    : "";

  // Low rounds: the task is simple enough that the snap answer is right — so the
  // player learns not to demand working for everything. High rounds: genuinely
  // multi-step, and the snap answer falls for a trap.
  const snapShouldBeCorrect = d <= 2;
  const snapGuidance = snapShouldBeCorrect
    ? "This is an EASIER round: keep the task short (about 2 steps) and make the quick snap answer CORRECT — set snapAnswerIndex EQUAL to correctIndex. The lesson is that simple tasks don't always need deep working."
    : `This is a HARDER round: the task genuinely needs ${d >= 4 ? "several" : "a few"} steps, and the quick snap answer must be WRONG — set snapAnswerIndex to a plausible TRAP option that is DIFFERENT from correctIndex. Only the step-by-step reasoning reaches the correct option.`;

  try {
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one "Think It Through" round at difficulty ${d} of 5. ${snapGuidance} Pick a fresh, recognisable workplace task and set "topic" to a short label for it.${avoidNote} Include every number and rule needed to solve it in the task message, write 3-4 options with a plausible trap, the quick snap answer, and a correct step-by-step chain of reasoning, then set the indices.`,
      maxOutputTokens: 1536,
    });

    const scenario = withOptionIds(raw);
    // If the model ignored the snap-correctness instruction, nudge it back so the
    // judgment axis stays meaningful across the five rounds.
    if (snapShouldBeCorrect && !scenario.snapCorrect) {
      scenario.snapAnswerId = scenario.correctOptionId;
      const snapOption = scenario.options.find(
        (o) => o.id === scenario.correctOptionId,
      );
      if (snapOption) scenario.snapAnswerText = snapOption.text;
      scenario.snapCorrect = true;
    } else if (!snapShouldBeCorrect && scenario.snapCorrect) {
      const trap = scenario.options.find((o) => o.id !== scenario.correctOptionId);
      if (trap) {
        scenario.snapAnswerId = trap.id;
        scenario.snapAnswerText = trap.text;
        scenario.snapCorrect = false;
      }
    }
    return scenario;
  } catch {
    return mockChainOfThoughtRound(d);
  }
}
