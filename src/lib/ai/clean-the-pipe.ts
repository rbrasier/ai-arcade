import { z } from "zod";

import { generateJson, generatePlainText, isConfigured } from "./connector";
import { mockCleanThePipeRound } from "./clean-the-pipe-mock";
import { pipeTierForDifficulty } from "../clean-the-pipe-tiers";
import type { SourceKind, SourcePath } from "../clean-the-pipe-scoring";

/**
 * "Clean the Pipe" generates a fresh data-integration round for each of the
 * game's five rounds. An AI step is fed by several whole DATA SOURCES — a
 * structured database, an email inbox, spreadsheets, scanned archives — and the
 * way the data flows in is what's wrong. The player decides, per source, HOW it
 * is fed into the system, then runs a pipeline simulation that is scored on the
 * resulting errors (the fewer the better — including the HUMAN errors a manual
 * migration introduces).
 *
 * EACH SOURCE IS HANDLED WITH ONE OF FOUR PATHS:
 *   - keep      : feed it in as-is             (already-structured sources)
 *   - redirect  : cut the intake over so NEW data arrives structured; leave the
 *                 old backlog unprocessed      (fix the channel going forward)
 *   - migrate   : convert/backfill the EXISTING data into a usable shape
 *                 (the heavy path — costs real hours AND introduces human error)
 *   - exclude   : drop the source from the step (wrong-scope / not worth it)
 *
 * The teaching points: fix the intake going forward where you can rather than
 * re-processing everything (easy rounds), choose the right migration path for
 * each historical source you actually need (hard rounds), and resist migrating
 * sources that don't earn it (the boss-round trap). Difficulty and the mix of
 * source kinds are shaped by `clean-the-pipe-tiers.ts`.
 */

/** A clickable preview of a source's contents. Shape varies by source type. */
export interface SourcePreview {
  /** Tabular preview (spreadsheet / database): column headers. */
  columns?: string[];
  /** Tabular preview: a few sample rows (each a list of cell strings). */
  rows?: string[][];
  /** Inbox preview: a few sample messages. */
  messages?: { from: string; subject?: string; body: string }[];
  /** Free-text preview (scans, audio, notes) the player reads. */
  note?: string;
}

export type SourceType =
  | "database"
  | "spreadsheet"
  | "email"
  | "forms"
  | "scans"
  | "api";

export interface PipeSource {
  id: string;
  /** Drives the icon and how the preview renders. */
  type: SourceType;
  /** Short name, e.g. "Customer queries inbox" or "2024 pricing sheet (xlsx)". */
  label: string;
  /** One neutral line on what the source is. */
  summary: string;
  /** Clickable contents so the player can inspect before deciding. */
  preview: SourcePreview;
  /** Neutral, non-spoiler note on what the STEP uses this source for. */
  usedFor: string;
  /** Items per quarter flowing through this source. */
  volume: number;
  /** Is new data still arriving through this channel? */
  ongoing: boolean;
  /** Whole-number hours a migration would take — shown to inform the choice. */
  migrationEffortHours: number;
  /** Ground truth — never sent to the client before scoring. */
  kind: SourceKind;
  /** Debrief: why this source called for the path it did. */
  reason: string;
}

export interface CleanThePipeScenario {
  /** Short topic label (e.g. "customer support") — keeps rounds distinct. */
  topic: string;
  difficulty: number;
  /** The AI step the pipeline feeds, e.g. "Summarise complaints into themes". */
  stepName: string;
  /** The colleague who hands over the work (styled like a direct message). */
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  /** One precise sentence naming what a well-designed pipeline achieves. */
  goal: string;
  /** The sources feeding the step. */
  sources: PipeSource[];
  /** Debrief: which source needed which path, and the calibration lesson. */
  explanation: string;
}

/** Shape the model returns (ids are added server-side). */
const previewSchema = z.object({
  columns: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
  messages: z
    .array(
      z.object({
        from: z.string(),
        subject: z.string().optional(),
        body: z.string(),
      }),
    )
    .optional(),
  note: z.string().optional(),
});

const sourceSchema = z.object({
  type: z.enum(["database", "spreadsheet", "email", "forms", "scans", "api"]),
  label: z.string(),
  summary: z.string(),
  preview: previewSchema,
  usedFor: z.string(),
  volume: z.number().positive(),
  ongoing: z.boolean(),
  migrationEffortHours: z.number().nonnegative(),
  kind: z.enum([
    "clean-structured",
    "messy-ongoing-no-history",
    "messy-historical-needed",
    "unusable-type-needed",
    "irrelevant",
    "unusable-not-worth",
  ]),
  reason: z.string(),
});

const scenarioSchema = z.object({
  topic: z.string(),
  stepName: z.string(),
  brief: z.object({
    senderName: z.string(),
    senderRole: z.string(),
    senderInitials: z.string(),
    message: z.string(),
  }),
  goal: z.string(),
  sources: z.array(sourceSchema).min(3).max(5),
  explanation: z.string(),
});

export type RawCleanThePipeScenario = z.infer<typeof scenarioSchema>;

const SYSTEM_PROMPT = `You generate rounds for "Clean the Pipe", a game about DATA-INTEGRATION DESIGN. An AI step (e.g. "summarise complaints into themes", "total expenses by category") is fed by several whole DATA SOURCES, and the way data flows in is what's wrong. For EACH source the player chooses ONE path, then a pipeline simulation is scored on the resulting ERRORS (fewer is better — and HUMAN errors from manual migration count, so over-migrating is a real failure).

THE FOUR PATHS (the player picks one per source):
   * "keep": feed it in untouched — correct for an already clean, structured source.
   * "redirect": cut the intake over so NEW data arrives structured (e.g. swap a free-text email channel for a structured form) and DON'T re-process the old backlog — correct for an ongoing messy channel whose old data isn't needed.
   * "migrate": convert / backfill the EXISTING data into a usable shape — correct for a historical source you genuinely need but whose data is messy, incomplete or the wrong type. This is the heavy path: it costs real hours and introduces some human error.
   * "exclude": drop the source from the step — correct for a wrong-scope, duplicate, out-of-period or low-value source that doesn't earn its migration.

Each source has:
- "type": one of "database" | "spreadsheet" | "email" | "forms" | "scans" | "api".
- "label": a short name (e.g. "Customer queries inbox", "2023 pricing sheet (xlsx)", "CRM contacts DB").
- "summary": one neutral line describing the source.
- "preview": the source's contents the player can open and read. Use "columns"+"rows" for spreadsheets/databases (show the dirt — blank key cells, mixed formats, wrong-period rows), "messages" for an inbox (a few realistic emails), or "note" for scans/audio/free text. Make the preview RICH enough that the right call is inferable from it.
- "usedFor": one neutral sentence on what the STEP uses this source for. A reasoning aid shown BEFORE scoring — it must NOT reveal whether the source is good or bad.
- "volume": items per quarter through this source (e.g. 50–4000).
- "ongoing": true if new data is still arriving via this channel (so "redirect" is meaningful), false for a fixed historical archive.
- "migrationEffortHours": whole-number hours a migration of this source would take (e.g. 4–60). Make the not-worth-it trap's number large.
- "kind": HIDDEN ground truth — exactly one of: "clean-structured" (→keep), "messy-ongoing-no-history" (→redirect), "messy-historical-needed" (→migrate), "unusable-type-needed" (→migrate), "irrelevant" (→exclude), "unusable-not-worth" (→exclude).
- "reason": one debrief sentence on why this source called for its best path.

Rules:
- The right path must be inferable from the source's preview, type, usedFor and ongoing flag alone — never require outside knowledge.
- Do NOT order sources by their answer; mix them up.
- Keep tasks grounded, professional and varied across rounds (different industries/subjects), each with a fitting sender whose name AND role suit the domain and vary round to round (never a recurring stock person).`;

/** Attach stable ids to sources (s1..). */
export function withSourceIds(
  raw: RawCleanThePipeScenario,
  difficulty: number,
): CleanThePipeScenario {
  const sources: PipeSource[] = raw.sources.map((s, i) => ({
    id: `s${i + 1}`,
    type: s.type,
    label: s.label,
    summary: s.summary,
    preview: s.preview,
    usedFor: s.usedFor,
    volume: Math.round(s.volume),
    ongoing: s.ongoing,
    migrationEffortHours: Math.round(s.migrationEffortHours),
    kind: s.kind,
    reason: s.reason,
  }));
  return {
    topic: raw.topic,
    difficulty,
    stepName: raw.stepName,
    brief: raw.brief,
    goal: raw.goal,
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
      prompt: `Generate one "Clean the Pipe" round at difficulty ${d} of 5. ${tier.guidance} Pick a fresh, recognisable data task and set "topic" to a short label for it.${avoidNote} Make sure the right path for every source is inferable from its preview, and that any tempting-but-wrong path is genuinely tempting.`,
      maxOutputTokens: 2400,
    });

    return withSourceIds(raw, d);
  } catch {
    return mockCleanThePipeRound(d);
  }
}

/**
 * Narrate the deliverable the step produced from the status-quo pipeline (do
 * nothing) vs the player's redesigned pipeline — the "what it produced" contrast
 * (the same idea as Prompt Golf). Illustrative only; the score comes from the
 * deterministic error simulation. Falls back to a deterministic stand-in
 * offline / on error.
 */
export async function generateCleanThePipeOutcome(args: {
  scenario: CleanThePipeScenario;
  paths: Record<string, SourcePath>;
}): Promise<{ before: string; after: string }> {
  const { scenario, paths } = args;

  if (!isConfigured()) {
    return mockCleanThePipeOutcome(scenario, paths);
  }

  const lines = scenario.sources
    .map((s) => {
      const path = paths[s.id] ?? "keep";
      return `- [${s.type}: ${s.label}] ${s.summary} (you: ${path})`;
    })
    .join("\n");

  try {
    const text = await generatePlainText({
      system:
        "You show the consequence of data-integration design by writing the SAME AI deliverable two ways. Output EXACTLY two short paragraphs separated by a line containing only '---'. The first is the deliverable from the STATUS-QUO pipeline (every source fed in as-is) — let the messy, wrong-type and out-of-scope sources visibly distort it. The second is the deliverable from the player's REDESIGNED pipeline — cleaner to the extent they migrated/redirected/excluded the right sources; if they left a needed source feeding garbage or dropped one they needed, it is still distorted. Be concrete and grounded, 2-3 sentences each. Do not lecture or mention scores.",
      prompt: `Step: ${scenario.stepName}\nGoal: ${scenario.goal}\n\nSources:\n${lines}`,
      maxOutputTokens: 400,
    });
    const [before, after] = text.split(/\n?---\n?/);
    if (before && after) return { before: before.trim(), after: after.trim() };
    return mockCleanThePipeOutcome(scenario, paths);
  } catch {
    return mockCleanThePipeOutcome(scenario, paths);
  }
}

/** Deterministic stand-in before-vs-after narration for the offline / mock path. */
function mockCleanThePipeOutcome(
  scenario: CleanThePipeScenario,
  paths: Record<string, SourcePath>,
): { before: string; after: string } {
  const problem = scenario.sources.filter(
    (s) => s.kind !== "clean-structured" && s.kind !== "irrelevant",
  );
  const stillBroken = scenario.sources.filter((s) => {
    const path = paths[s.id] ?? "keep";
    if (s.kind === "messy-historical-needed" || s.kind === "unusable-type-needed") {
      return path !== "migrate";
    }
    return false;
  });

  const before =
    problem.length > 0
      ? `Run on the pipeline as it stands, "${scenario.stepName}" came out distorted: ${problem
          .map((s) => s.label)
          .join(", ")} fed in messy or in the wrong shape, so the deliverable can't be trusted.`
      : `The sources were already clean, so "${scenario.stepName}" produced a sound result even without changes.`;

  const after =
    stillBroken.length > 0
      ? `Your redesign still falls short: ${stillBroken
          .map((s) => s.label)
          .join(", ")} needed migrating and didn't get it, so the step is still working from broken data.`
      : `Your redesigned pipeline produced a clean, trustworthy deliverable — the sources that mattered were migrated or redirected into shape, and the ones that didn't earn it were left out.`;

  return { before, after };
}
