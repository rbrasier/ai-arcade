import { z } from "zod";

import { generateJson, generatePlainText, isConfigured } from "./connector";
import { mockCleanThePipeRound } from "./clean-the-pipe-mock";
import { pipeTierForDifficulty } from "../clean-the-pipe-tiers";
import type { RecordAction, SourceAction } from "../clean-the-pipe-scoring";

/**
 * "Clean the Pipe" generates a fresh data-triage round for each of the game's
 * five rounds. The player is about to run an AI step (e.g. "summarise these
 * complaints into themes") on a batch of input data — and the data is dirty.
 * They triage it BEFORE pressing run, then see what the AI made from the raw vs
 * the cleaned data. It is the input-side mirror of Spot the Hallucination:
 * output vigilance and input hygiene are the two halves of trusting AI work.
 *
 * The teaching point is that NOT ALL DIRT IS EQUAL — catch the records that
 * actually poison the output, leave the harmless ones alone, and calibrate
 * cleaning effort to consequence. From round 4, some inputs are whole SOURCES
 * whose data type doesn't suit the system, where the player weighs leaving the
 * data as-is against migrating it for a real effort cost. Difficulty scales the
 * dirt and the source pressure via `clean-the-pipe-tiers.ts`.
 */

export interface DataRecord {
  id: string;
  /** Short label for the row, e.g. "Row 14 · NW region". */
  label: string;
  /** The data row itself, shown verbatim so the player can spot the dirt. */
  content: string;
  /** Ground truth — never sent to the client before scoring. */
  consequential: boolean;
  correctAction: RecordAction;
  /** Debrief: why this record needed (or didn't need) cleaning. */
  reason: string;
}

export interface MismatchedSource {
  id: string;
  /** Name of the source, e.g. "Scanned PDF contracts (2023)". */
  name: string;
  /** Plain-language line on why the data TYPE doesn't suit the system. */
  mismatch: string;
  /** Hours it would take to migrate the source into a usable shape. */
  migrationEffort: number;
  /** Ground truth — never sent to the client before scoring. */
  consequential: boolean;
  correctAction: SourceAction;
  /** Debrief: why migrating was (or wasn't) worth the effort. */
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
  /** The data rows going into the step. */
  records: DataRecord[];
  /** Type-mismatched sources (empty on rounds 1-3). */
  sources: MismatchedSource[];
  /** Debrief: which dirt mattered, which didn't, and the calibration lesson. */
  explanation: string;
}

/** Shape the model returns (ids are added server-side). */
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
  records: z
    .array(
      z.object({
        label: z.string(),
        content: z.string(),
        consequential: z.boolean(),
        correctAction: z.enum(["keep", "fix", "drop"]),
        reason: z.string(),
      }),
    )
    .min(4)
    .max(8),
  sources: z
    .array(
      z.object({
        name: z.string(),
        mismatch: z.string(),
        migrationEffort: z.number().positive(),
        consequential: z.boolean(),
        correctAction: z.enum(["leave", "migrate"]),
        reason: z.string(),
      }),
    )
    .max(2),
  explanation: z.string(),
});

export type RawCleanThePipeScenario = z.infer<typeof scenarioSchema>;

const SYSTEM_PROMPT = `You generate rounds for "Clean the Pipe", a game that teaches input hygiene — the input-side mirror of spotting hallucinations. The player is about to run an AI step on a batch of data and must TRIAGE the data first: catch the dirt that actually poisons the output, and leave the harmless dirt alone. The hard lesson is that NOT ALL DIRT IS EQUAL — a cosmetic duplicate barely matters, but a wrong-category or stale record poisons the whole result. Over-cleaning (chasing every blemish) is a real failure, not just wasted time.

Each round is a realistic workplace data task (e.g. summarising complaints into themes, tallying survey results, compiling a report). You produce:
- "topic": a 1-4 word label for the data's subject.
- "stepName": the AI step about to run, phrased as an imperative (e.g. "Summarise the complaints into themes").
- "datasetName": a short name for the dataset going in.
- "brief": the colleague handing over the task — a "senderName", a "senderRole" job title, two-letter "senderInitials", and a short natural "message". The name AND role must FIT THIS data's domain and vary round to round — never a recurring stock person.
- "goal": one precise sentence naming what good triage achieves.
- "records": the data rows going into the step. Each has a short "label", the "content" of the row shown verbatim so the dirt is visible, a "consequential" boolean, a "correctAction", and a "reason" for the debrief. Action meanings:
   * "keep": leave the row as-is. Use for clean rows AND for HARMLESS dirt (an exact duplicate, a blank in a field the step doesn't use, a cosmetic format difference). These are consequential:false — cleaning them only wastes effort.
   * "fix": the row is consequential but RECOVERABLE — repair it in place (a blank in the field the step needs, a wrong-format value that matters). consequential:true.
   * "drop": the row is consequential and does NOT belong / is unrecoverable (a wrong-category entry, a stale out-of-date record, a corrupt row). consequential:true.
- "sources": abstract sources whose data TYPE doesn't suit the system. Each has a "name", a plain "mismatch" line a non-technical reader understands, a "migrationEffort" in hours, a "consequential" boolean, a "correctAction" ("leave" or "migrate"), and a "reason". A consequential source (its mismatch would break/badly degrade the output) has correctAction "migrate" — worth the effort. A tolerable mismatch (the model can cope, or it's low-value) is consequential:false with correctAction "leave" — migrating it burns effort for little gain, especially when its migrationEffort is large.

Rules:
- The right call must be inferable from the record content / mismatch line alone — never require outside knowledge.
- Do NOT order records by their action; consequential rows must not always be first or last.
- Always include some genuinely harmless dirt so the player must RESIST over-cleaning.
- Keep tasks grounded, professional and varied across rounds (different industries/subjects), each with its own fitting sender.`;

/** Attach stable ids to records (r1..) and sources (m1..). */
export function withItemIds(
  raw: RawCleanThePipeScenario,
  difficulty: number,
): CleanThePipeScenario {
  const records: DataRecord[] = raw.records.map((r, i) => ({
    id: `r${i + 1}`,
    label: r.label,
    content: r.content,
    consequential: r.consequential,
    correctAction: r.correctAction,
    reason: r.reason,
  }));
  const sources: MismatchedSource[] = raw.sources.map((s, i) => ({
    id: `m${i + 1}`,
    name: s.name,
    mismatch: s.mismatch,
    migrationEffort: s.migrationEffort,
    consequential: s.consequential,
    correctAction: s.correctAction,
    reason: s.reason,
  }));
  return {
    topic: raw.topic,
    difficulty,
    stepName: raw.stepName,
    datasetName: raw.datasetName,
    brief: raw.brief,
    goal: raw.goal,
    records,
    sources,
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
      prompt: `Generate one "Clean the Pipe" round at difficulty ${d} of 5. ${tier.guidance} Pick a fresh, recognisable data task and set "topic" to a short label for it.${avoidNote} Make sure the right call for every record and source is inferable from what is shown, and that the harmless dirt is genuinely tempting to clean.`,
      maxOutputTokens: 1800,
    });

    // Keep the source count honest to the tier even if the model strays.
    if (!tier.hasSources) raw.sources = [];
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
  recordActions: Record<string, RecordAction>;
  sourceActions: Record<string, SourceAction>;
}): Promise<{ raw: string; cleaned: string }> {
  const { scenario, recordActions, sourceActions } = args;

  if (!isConfigured()) {
    return mockCleanThePipeOutcome(scenario, recordActions, sourceActions);
  }

  const recordLines = scenario.records
    .map((r) => {
      const action = recordActions[r.id] ?? "keep";
      return `- [${r.label}] ${r.content} (you: ${action})`;
    })
    .join("\n");
  const sourceLines = scenario.sources
    .map((s) => {
      const action = sourceActions[s.id] ?? "leave";
      return `- [${s.name}] ${s.mismatch} (you: ${action})`;
    })
    .join("\n");

  try {
    const text = await generatePlainText({
      system:
        "You show the consequence of input hygiene by writing the SAME AI deliverable two ways. Output EXACTLY two short paragraphs separated by a line containing only '---'. The first paragraph is the deliverable produced from the RAW, untouched data — let the consequential bad records and any ill-fitting source visibly distort it (wrong themes, skewed totals, garbled entries). The second is the deliverable from the player's triaged data — cleaner to the extent they removed/fixed/migrated what mattered; if they left a consequential item in, it is still distorted. Be concrete and grounded, 2-3 sentences each. Do not lecture or mention scores.",
      prompt: `Step: ${scenario.stepName}\nGoal: ${scenario.goal}\n\nRecords:\n${recordLines}\n\nSources:\n${sourceLines || "(none)"}`,
      maxOutputTokens: 400,
    });
    const [raw, cleaned] = text.split(/\n?---\n?/);
    if (raw && cleaned) return { raw: raw.trim(), cleaned: cleaned.trim() };
    return mockCleanThePipeOutcome(scenario, recordActions, sourceActions);
  } catch {
    return mockCleanThePipeOutcome(scenario, recordActions, sourceActions);
  }
}

/** Deterministic stand-in raw-vs-cleaned narration for the offline / mock path. */
function mockCleanThePipeOutcome(
  scenario: CleanThePipeScenario,
  recordActions: Record<string, RecordAction>,
  sourceActions: Record<string, SourceAction>,
): { raw: string; cleaned: string } {
  const badRecords = scenario.records.filter((r) => r.consequential);
  const badSources = scenario.sources.filter((s) => s.consequential);
  const leftIn = [
    ...badRecords.filter((r) => (recordActions[r.id] ?? "keep") === "keep"),
    ...badSources.filter((s) => (sourceActions[s.id] ?? "leave") === "leave"),
  ];

  const raw =
    badRecords.length || badSources.length
      ? `Run on the raw data, "${scenario.stepName}" came out distorted: ${[
          ...badRecords.map((r) => r.label),
          ...badSources.map((s) => s.name),
        ].join(", ")} dragged the result off course, so the deliverable can't be trusted.`
      : `The raw data was already clean, so "${scenario.stepName}" produced a sound result.`;

  const cleaned =
    leftIn.length > 0
      ? `Your version is still off: ${leftIn
          .map((x) => ("label" in x ? x.label : x.name))
          .join(", ")} stayed in and kept poisoning the output. The dirt that mattered slipped through.`
      : `Your triaged data produced a clean, trustworthy deliverable — the records and sources that would have skewed "${scenario.stepName}" were dealt with, and the harmless dirt was rightly left alone.`;

  return { raw, cleaned };
}
