import { z } from "zod";

import { generateJson, generatePlainText, isConfigured } from "./connector";
import { mockContextCalibrationRound } from "./context-calibration-mock";
import type { ContextItemKind } from "../context-calibration-scoring";

/**
 * "Context Calibration" generates a fresh desk task for each of the game's five
 * rounds, plus a TRAY of candidate context snippets. The player decides which
 * snippets to attach to the prompt — practising the real skill of choosing what
 * context actually improves an answer.
 *
 * The teaching point is calibration, not "more is better": each tray mixes
 * snippets the answer genuinely needs (essential) with harmless clutter (noise)
 * and — crucially — plausible-looking DISTRACTORS that steer the model to a
 * wrong answer if attached. Too little context starves the answer; too much
 * misdirects it. Difficulty scales how many distractors appear and how
 * tempting they look.
 */

export interface ContextItem {
  id: string;
  text: string;
  /** Ground truth — never sent to the client before scoring. */
  kind: ContextItemKind;
  /**
   * One short line, shown only in the debrief, explaining this snippet's role —
   * why it was essential, or concretely why it was irrelevant/misleading to
   * attach. Ground truth (it reveals the kind), so it is stripped pre-scoring.
   */
  reason: string;
}

export interface ContextCalibrationScenario {
  /** Short topic label (e.g. "refund email", "venue booking") — keeps rounds distinct. */
  topic: string;
  /** The colleague who forwards the task (styled like a direct message). */
  task: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    /** The request, in natural language. */
    message: string;
  };
  /** The precise deliverable the attached context should produce a good answer for. */
  goal: string;
  /** The candidate context snippets the player chooses from. */
  items: ContextItem[];
  // ----- ground truth lives on each item's `kind`; this is the debrief note. -----
  /** Debrief: which snippets mattered, which would misdirect, and why. */
  explanation: string;
}

/** Shape the model returns (items as { text, kind }). */
const scenarioSchema = z.object({
  topic: z.string(),
  task: z.object({
    senderName: z.string(),
    senderRole: z.string(),
    senderInitials: z.string(),
    message: z.string(),
  }),
  goal: z.string(),
  items: z
    .array(
      z.object({
        text: z.string(),
        kind: z.enum(["essential", "helpful", "noise", "distractor"]),
        reason: z.string(),
      }),
    )
    .min(4)
    .max(8),
  explanation: z.string(),
});

export type RawContextCalibrationScenario = z.infer<typeof scenarioSchema>;

const SYSTEM_PROMPT = `You generate rounds for "Context Calibration", a game that teaches people the practical skill of choosing WHAT CONTEXT to give an AI so it produces a better answer — and the harder lesson that piling on too much or irrelevant context can MISDIRECT the model toward a wrong answer.

Each round is a realistic workplace task (e.g. drafting a reply, picking a date, recommending an option, calculating a figure). You also produce a TRAY of candidate context snippets the player can attach to the prompt. Every snippet is labelled with exactly one "kind":
- "essential": a fact the task genuinely needs to be answered correctly. There should be 1-2 of these. Without them the answer is wrong or made-up.
- "helpful": true and relevant but not strictly required — it sharpens the answer without being necessary. 0-1 of these.
- "noise": true but irrelevant to THIS task — harmless clutter that should be left out (e.g. an unrelated office update, a stale figure for a different project).
- "distractor": the dangerous one. It looks relevant and plausible, but attaching it would steer the answer WRONG (e.g. a superseded policy, a figure for the wrong client, a deadline from a different request, a constraint that doesn't apply here). Each distractor must be something a careless person would be tempted to include.

Fields:
- "topic": a 1-4 word label for the task's subject (e.g. "refund email", "venue booking").
- "task": the colleague forwarding the work — a "senderName", a "senderRole" job title and two-letter "senderInitials", plus a short, natural "message" asking for the deliverable. The name AND the role must FIT THIS SPECIFIC task's domain (a venue booking comes from an events manager; a sales report from a commercial analyst) and should vary from round to round — never reuse a stock name.
- "goal": one precise sentence naming the deliverable the player is curating context for.
- "items": 4-8 snippets, each a short standalone sentence or fact, with its "kind" and a "reason". Mix the kinds; do NOT order them by kind (shuffle so essentials aren't always first). Make distractors genuinely tempting, not obviously wrong.
- "reason" (per snippet): one short line, shown only AFTER the player commits, that plainly explains this snippet's role — why it is essential, or CONCRETELY why attaching it was irrelevant or misleading (e.g. "it's last quarter's figure, not this one", "it applies to new customers, not returning ones"). For noise/distractors especially, make the reason a clear, specific explanation of why it does not belong, not a vague "not needed".
- "explanation": one short paragraph for the debrief — name which snippets were essential, which would have misled the answer, and the calibration lesson.

Rules:
- The task must be answerable correctly from the essential (+ helpful) snippets alone.
- Every distractor must be plausibly on-topic yet lead to a materially wrong answer if used, and its "reason" must say exactly why.
- Keep tasks grounded, professional and varied across rounds (different industries/subjects), each with its own fitting sender (name + role), not a recurring stock person.`;

/** Attach stable ids (c1..cN) to each snippet. */
export function withItemIds(raw: RawContextCalibrationScenario): ContextCalibrationScenario {
  const items: ContextItem[] = raw.items.map((it, i) => ({
    id: `c${i + 1}`,
    text: it.text,
    kind: it.kind,
    reason: it.reason,
  }));
  return {
    topic: raw.topic,
    task: raw.task,
    goal: raw.goal,
    items,
    explanation: raw.explanation,
  };
}

/**
 * Generate a round at the given difficulty (1-5). Falls back to a mock bank when
 * no AI provider is configured (or on error). `opts.avoidTopics` lists topics
 * already used earlier in the play-through so the five rounds stay distinct.
 *
 * Difficulty scales the misdirection pressure: easy rounds have obvious noise
 * and no/one weak distractor; hard rounds plant several tempting distractors so
 * the player must resist the urge to attach everything.
 */
export async function generateContextCalibrationRound(
  difficulty: number,
  opts: { avoidTopics?: string[] } = {},
): Promise<ContextCalibrationScenario> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));

  if (!isConfigured()) {
    return mockContextCalibrationRound(d);
  }

  const avoid = (opts.avoidTopics ?? []).filter(Boolean);
  const avoidNote = avoid.length
    ? ` Do NOT reuse any of these already-used topics (pick a clearly different subject): ${avoid.join("; ")}.`
    : "";

  // Distractor pressure rises with difficulty — the "too much misdirects" lesson
  // gets harder as the temptation to over-include grows.
  const mixGuidance =
    d <= 2
      ? "This is an EASIER round: a quick single-answer task. Include 1 essential snippet, 0-1 distractor (if any, make it gentle), and the rest obvious noise, so it's clear what to add and what to drop. Keep each snippet to one short sentence."
      : d === 3
        ? "This is a MID round: include 1-2 essentials and exactly 1 genuinely tempting distractor among the noise."
        : "This is a HARDER, MORE INVOLVED round: frame it as COMPILING A REPORT OR BRIEF from a SELECTION OF DOCUMENTS — the task asks the player to pull together a detailed deliverable (e.g. a quarterly review, a board summary, a risk report). Each snippet is a short DESCRIPTION OF A CANDIDATE DOCUMENT (what it is and what period/scope it covers), not a one-line fact. Include 2-3 essential documents the report genuinely needs and 2-3 tempting distractor documents that look on-topic but are the wrong period, wrong scope, superseded, or never adopted — so the player must resist attaching everything. Make the distractors' wrongness inferable from their description.";

  try {
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one "Context Calibration" round at difficulty ${d} of 5. ${mixGuidance} Pick a fresh, recognisable workplace task and set "topic" to a short label for it.${avoidNote} Make sure the task is fully answerable from the essential snippet(s), and that every distractor would plausibly tempt someone yet lead to a wrong answer.`,
      maxOutputTokens: 1536,
    });

    return withItemIds(raw);
  } catch {
    return mockContextCalibrationRound(d);
  }
}

/**
 * Execute the player's curated context to produce the deliverable shown on the
 * scorecard — so they SEE how their selection shaped the answer (the same
 * "what it produced" idea as Prompt Golf). Illustrative only; the score is graded
 * deterministically from the snippet kinds, not from this text. Falls back to a
 * short deterministic stand-in when no provider is configured (or on error).
 */
export async function generateContextCalibrationOutput(args: {
  scenario: ContextCalibrationScenario;
  selectedItems: ContextItem[];
}): Promise<string> {
  const { scenario, selectedItems } = args;
  const contextBlock = selectedItems.length
    ? selectedItems.map((it) => `- ${it.text}`).join("\n")
    : "(no context attached)";

  if (!isConfigured()) {
    return mockContextCalibrationOutput(scenario, selectedItems);
  }

  try {
    return await generatePlainText({
      system:
        "You are a workplace assistant. Complete the colleague's request using ONLY the context provided. If the attached context is missing a needed detail, do your best but do not invent specifics. If a piece of context is misleading or irrelevant, you may still rely on it — answer as a literal assistant would. Keep the answer to 2-4 sentences.",
      prompt: `Request from ${scenario.task.senderName} (${scenario.task.senderRole}): ${scenario.task.message}\n\nDeliverable: ${scenario.goal}\n\nAttached context:\n${contextBlock}`,
      maxOutputTokens: 320,
    });
  } catch {
    return mockContextCalibrationOutput(scenario, selectedItems);
  }
}

/** Deterministic stand-in deliverable for the offline / mock path. */
function mockContextCalibrationOutput(
  scenario: ContextCalibrationScenario,
  selectedItems: ContextItem[],
): string {
  const hasEssential = selectedItems.some((it) => it.kind === "essential");
  const hasDistractor = selectedItems.some((it) => it.kind === "distractor");
  const missingEssential = scenario.items.some((it) => it.kind === "essential")
    && !hasEssential;

  if (missingEssential) {
    return `Here's a draft for "${scenario.goal}", but the key detail it needs wasn't attached, so parts are guessed and may be wrong.`;
  }
  if (hasDistractor) {
    return `Here's "${scenario.goal}" — but one of the attached snippets pulled the answer off course, so it follows the wrong figure/rule. Worth a careful check.`;
  }
  return `Here's a clean draft for "${scenario.goal}", grounded only in the details that actually applied.`;
}
