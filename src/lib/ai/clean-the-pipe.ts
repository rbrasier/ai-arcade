import { z } from "zod";

import { generateJson, generatePlainText, isConfigured } from "./connector";
import { mockCleanThePipeRound } from "./clean-the-pipe-mock";
import { pipeTierForDifficulty } from "../clean-the-pipe-tiers";
import type { ItemKind, TriageAction } from "../clean-the-pipe-scoring";

/**
 * "Clean the Pipe" generates a fresh data-triage round for each of the game's
 * five rounds. The player is about to run an AI step (e.g. "summarise these
 * complaints into themes") on a batch of input data — and the data is dirty.
 * They triage it BEFORE pressing run, then see what the AI made from the raw vs
 * the cleaned data. It is the input-side mirror of Spot the Hallucination:
 * output vigilance and input hygiene are the two halves of trusting AI work.
 *
 * EVERYTHING IS ONE TRIAGE QUEUE. Each input is an `item` with a `kind`:
 *   - "record": a single data row.
 *   - "batch":  a whole source whose data TYPE doesn't suit the system (audio
 *               feeding a text summariser, a different-schema export, scanned
 *               PDFs). Batches appear only on the harder rounds (4-5).
 * Both kinds are triaged with the SAME three verbs — pass / repair / bin — so
 * the player learns one mental model, not two.
 *
 * The teaching point is that NOT ALL DIRT IS EQUAL — catch the items that
 * actually poison the output, leave the harmless ones alone, and calibrate
 * cleaning effort to consequence. A batch repair is a migration that costs real
 * hours, so the harder rounds also teach "migrate only where it pays off".
 * Difficulty scales the dirt and the batch pressure via `clean-the-pipe-tiers.ts`.
 */

export interface PipeItem {
  id: string;
  kind: ItemKind;
  /** Short label, e.g. "Row 14 · NW region" or "Call-centre audio (Q2)". */
  label: string;
  /** The row itself (records) or a plain mismatch line (batches), shown verbatim. */
  content: string;
  /** Neutral, non-spoiler note on what the step actually uses this item for. */
  usedFor: string;
  /** What repairing this item would yield — shown live when "repair" is picked. */
  repairedContent?: string;
  /** Hours a repair (migration) would cost — batches only; shown to the player. */
  migrationEffort?: number;
  /** Ground truth — never sent to the client before scoring. */
  consequential: boolean;
  correctAction: TriageAction;
  /** Debrief: why this item needed (or didn't need) cleaning. */
  reason: string;
}

export interface CleanThePipeScenario {
  /** Short topic label (e.g. "customer complaints") — keeps rounds distinct. */
  topic: string;
  difficulty: number;
  /** The AI step about to run, e.g. "Summarise complaints into themes". */
  stepName: string;
  /** Name of the dataset going in, e.g. "Q2 complaints export". */
  datasetName: string;
  /** The colleague who hands over the step (styled like a direct message). */
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  /** One precise sentence naming what good triage achieves. */
  goal: string;
  /** The inputs going into the step — records, plus batches on rounds 4-5. */
  items: PipeItem[];
  /** Debrief: which dirt mattered, which didn't, and the calibration lesson. */
  explanation: string;
}

/** Shape the model returns (ids are added server-side). */
const itemSchema = z.object({
  kind: z.enum(["record", "batch"]),
  label: z.string(),
  content: z.string(),
  usedFor: z.string(),
  repairedContent: z.string().optional(),
  migrationEffort: z.number().positive().optional(),
  consequential: z.boolean(),
  correctAction: z.enum(["pass", "repair", "bin"]),
  reason: z.string(),
});

const scenarioSchema = z.object({
  topic: z.string(),
  stepName: z.string(),
  datasetName: z.string(),
  brief: z.object({
    senderName: z.string(),
    senderRole: z.string(),
    senderInitials: z.string(),
    message: z.string(),
  }),
  goal: z.string(),
  items: z.array(itemSchema).min(4).max(9),
  explanation: z.string(),
});

export type RawCleanThePipeScenario = z.infer<typeof scenarioSchema>;

const SYSTEM_PROMPT = `You generate rounds for "Clean the Pipe", a game that teaches input hygiene — the input-side mirror of spotting hallucinations. The player is about to run an AI step on a batch of data and must TRIAGE the inputs first: catch the dirt that actually poisons the output, and leave the harmless dirt alone. The hard lesson is that NOT ALL DIRT IS EQUAL — a cosmetic duplicate barely matters, but a wrong-category or stale row poisons the whole result. Over-cleaning (chasing every blemish) is a real failure, not just wasted time.

EVERYTHING IS ONE QUEUE OF "items". Every item is triaged with the SAME three verbs:
   * "pass": let it through untouched. Use for clean rows AND for HARMLESS dirt (an exact duplicate, a blank in a field the step doesn't use, a cosmetic format difference), AND for a tolerable batch whose mismatch the system can cope with. These are consequential:false — touching them only wastes effort.
   * "repair": the item is consequential but RECOVERABLE — fix the row in place, or convert/migrate a batch into a usable shape. consequential:true. The heavier clean-out; a batch repair is a migration that costs real hours.
   * "bin": the item is consequential and does NOT belong / is unrecoverable — drop a wrong-category or stale row, or exclude an ill-fitting batch. consequential:true. Cheaper than repair, but the data is lost.

Each item has:
- "kind": "record" (a single data row) or "batch" (a whole source whose data TYPE doesn't suit the system).
- "label": a short label (e.g. "Row 14 · NW region", or a source name like "Call-centre audio recordings (Q2)").
- "content": for a record, the row shown verbatim so the dirt is visible; for a batch, a plain one-line description of the type mismatch a non-technical reader understands.
- "usedFor": one neutral sentence on what the STEP actually uses this item for. This is a reasoning aid shown to the player BEFORE scoring — it must NOT reveal whether the item is good or bad, only what role it plays.
- "repairedContent": what repairing the item would yield (the patched row value, or "Transcribed to text", "Currencies converted and stages mapped", etc.). Include it for any item where a repair is plausible — especially the recoverable ones.
- "migrationEffort": for BATCH items only, the whole-number hours a repair (migration) would take (e.g. 6-40).
- "consequential": boolean ground truth.
- "correctAction": "pass" | "repair" | "bin".
- "reason": one debrief sentence on why this was (or wasn't) worth cleaning.

Rules:
- The right call must be inferable from the item's content / mismatch line alone — never require outside knowledge.
- Do NOT order items by their action; consequential items must not always be first or last, and batches should sit among the records, not all at the end.
- Always include some genuinely harmless dirt so the player must RESIST over-cleaning.
- Keep tasks grounded, professional and varied across rounds (different industries/subjects), each with its own fitting sender whose name AND role fit the data's domain and vary round to round (never a recurring stock person).`;

/** Attach stable ids to items (i1..). */
export function withItemIds(
  raw: RawCleanThePipeScenario,
  difficulty: number,
): CleanThePipeScenario {
  const items: PipeItem[] = raw.items.map((it, i) => ({
    id: `i${i + 1}`,
    kind: it.kind,
    label: it.label,
    content: it.content,
    usedFor: it.usedFor,
    repairedContent: it.repairedContent,
    migrationEffort: it.kind === "batch" ? it.migrationEffort : undefined,
    consequential: it.consequential,
    correctAction: it.correctAction,
    reason: it.reason,
  }));
  return {
    topic: raw.topic,
    difficulty,
    stepName: raw.stepName,
    datasetName: raw.datasetName,
    brief: raw.brief,
    goal: raw.goal,
    items,
    explanation: raw.explanation,
  };
}

/**
 * Generate a round at the given difficulty (1-5). Falls back to a mock bank when
 * no AI provider is configured (or on error). `opts.avoidTopics` lists topics
 * already used earlier in the play-through so the five rounds stay distinct.
 */
export async function generateCleanThePipeRound(
  difficulty: number,
  opts: { avoidTopics?: string[] } = {},
): Promise<CleanThePipeScenario> {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  const tier = pipeTierForDifficulty(d);

  if (!isConfigured()) {
    return mockCleanThePipeRound(d);
  }

  const avoid = (opts.avoidTopics ?? []).filter(Boolean);
  const avoidNote = avoid.length
    ? ` Do NOT reuse any of these already-used topics (pick a clearly different subject): ${avoid.join("; ")}.`
    : "";

  try {
    const raw = await generateJson(scenarioSchema, {
      system: SYSTEM_PROMPT,
      prompt: `Generate one "Clean the Pipe" round at difficulty ${d} of 5. ${tier.guidance} Pick a fresh, recognisable data task and set "topic" to a short label for it.${avoidNote} Make sure the right call for every item is inferable from what is shown, and that the harmless dirt is genuinely tempting to clean.`,
      maxOutputTokens: 1900,
    });

    // Keep the batch count honest to the tier even if the model strays.
    if (!tier.hasBatches) raw.items = raw.items.filter((it) => it.kind !== "batch");
    return withItemIds(raw, d);
  } catch {
    return mockCleanThePipeRound(d);
  }
}

/**
 * Narrate the deliverable the step produced from the RAW data vs the player's
 * TRIAGED data — the signature "raw vs cleaned" contrast (the same "what it
 * produced" idea as Prompt Golf). Illustrative only; the score is graded
 * deterministically. Falls back to a deterministic stand-in offline / on error.
 */
export async function generateCleanThePipeOutcome(args: {
  scenario: CleanThePipeScenario;
  actions: Record<string, TriageAction>;
}): Promise<{ raw: string; cleaned: string }> {
  const { scenario, actions } = args;

  if (!isConfigured()) {
    return mockCleanThePipeOutcome(scenario, actions);
  }

  const itemLines = scenario.items
    .map((it) => {
      const action = actions[it.id] ?? "pass";
      return `- [${it.kind}: ${it.label}] ${it.content} (you: ${action})`;
    })
    .join("\n");

  try {
    const text = await generatePlainText({
      system:
        "You show the consequence of input hygiene by writing the SAME AI deliverable two ways. Output EXACTLY two short paragraphs separated by a line containing only '---'. The first paragraph is the deliverable produced from the RAW, untouched data — let the consequential bad records and any ill-fitting batch visibly distort it (wrong themes, skewed totals, garbled or missing entries). The second is the deliverable from the player's triaged data — cleaner to the extent they binned/repaired what mattered; if they let a consequential item pass, it is still distorted. Be concrete and grounded, 2-3 sentences each. Do not lecture or mention scores.",
      prompt: `Step: ${scenario.stepName}\nGoal: ${scenario.goal}\n\nItems:\n${itemLines}`,
      maxOutputTokens: 400,
    });
    const [raw, cleaned] = text.split(/\n?---\n?/);
    if (raw && cleaned) return { raw: raw.trim(), cleaned: cleaned.trim() };
    return mockCleanThePipeOutcome(scenario, actions);
  } catch {
    return mockCleanThePipeOutcome(scenario, actions);
  }
}

/** Deterministic stand-in raw-vs-cleaned narration for the offline / mock path. */
function mockCleanThePipeOutcome(
  scenario: CleanThePipeScenario,
  actions: Record<string, TriageAction>,
): { raw: string; cleaned: string } {
  const bad = scenario.items.filter((it) => it.consequential);
  const leftIn = bad.filter((it) => (actions[it.id] ?? "pass") === "pass");

  const raw =
    bad.length > 0
      ? `Run on the raw data, "${scenario.stepName}" came out distorted: ${bad
          .map((it) => it.label)
          .join(", ")} dragged the result off course, so the deliverable can't be trusted.`
      : `The raw data was already clean, so "${scenario.stepName}" produced a sound result.`;

  const cleaned =
    leftIn.length > 0
      ? `Your version is still off: ${leftIn
          .map((it) => it.label)
          .join(", ")} stayed in and kept poisoning the output. The dirt that mattered slipped through.`
      : `Your triaged data produced a clean, trustworthy deliverable — the items that would have skewed "${scenario.stepName}" were dealt with, and the harmless dirt was rightly left alone.`;

  return { raw, cleaned };
}
