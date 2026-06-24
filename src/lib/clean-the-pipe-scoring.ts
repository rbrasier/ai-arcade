/**
 * Pure, dependency-free scoring + simulation for "Clean the Pipe" (input/data
 * integration design). Imports nothing from the AI connector or the server
 * runtime so it can be shared by BOTH the scoring route (server) and the game
 * component (client) — the official score and any preview use the same maths.
 *
 * THE MODEL IS A PER-SOURCE INTEGRATION DECISION. An AI step is fed by several
 * whole DATA SOURCES (a structured database, an email inbox, spreadsheets, scans
 * …). For each source the player chooses ONE path:
 *
 *   keep      – feed it in as-is            (right for already-structured sources)
 *   redirect  – cut the intake over so NEW data arrives structured; don't
 *               re-process the old backlog  (fix the channel going forward)
 *   migrate   – convert/backfill the EXISTING data into a usable shape
 *               (the heavy path — costs real hours AND introduces human error)
 *   exclude   – drop the source from the step (right for wrong-scope / not-worth-it)
 *
 * A pipeline SIMULATION is then run and SCORED on the resulting errors — the
 * fewer errors the better. Crucially the error count folds in HUMAN errors
 * (re-keying / migration mistakes), so migrating a source that didn't need it
 * makes things worse, not merely wasteful: over-investment is a real failure.
 *
 * Everything scored is DERIVED from each source's hidden `kind` via a fixed rate
 * table (the same idea as checkpoint-impact.ts keying rates off StepKind), so a
 * round can never be internally inconsistent and `bestPath` falls out as the
 * argmin rather than being authored.
 *
 * Scoring (see docs/GAME-RULES.md):
 *
 *   baseline = Σ errors(source, keep)        // do nothing — the status-quo output
 *   best     = Σ errors(source, bestPath)
 *   yours    = Σ errors(source, chosenPath)
 *   scoreRatio = clamp01((baseline - yours) / (baseline - best))   // 1 if nothing to fix
 *   if a CRITICAL source is left poisoning the output → cap at GATE_CAP (0.5)
 *   score = round(scoreRatio * maxScore)
 *
 * So leaving a needed source feeding garbage (or dropping needed data) caps the
 * round below the 65% clear, and picking a path WORSE than keep (e.g. migrating
 * a clean source) drags `yours` toward/over `baseline` → the ratio collapses.
 */

/** What the player can do with a whole source. */
export type SourcePath = "keep" | "redirect" | "migrate" | "exclude";

/**
 * The situation a source is in. The generator authors this; everything scored is
 * derived from it. Each kind has exactly one clearly-best path, and a different
 * path wins for different kinds so no single reflex clears a round.
 */
export type SourceKind =
  | "clean-structured" // already good                              → keep
  | "messy-ongoing-no-history" // messy live channel, old data not needed → redirect
  | "messy-historical-needed" // messy/incomplete store you DO need       → migrate
  | "unusable-type-needed" // wrong data TYPE but needed (scans/audio)  → migrate
  | "irrelevant" // wrong-scope / duplicate / out-of-period   → exclude
  | "unusable-not-worth"; // wrong-type but low-value — migration doesn't pay → exclude

export const ALL_PATHS: SourcePath[] = ["keep", "redirect", "migrate", "exclude"];

/** The do-nothing default — feed the source in untouched. */
export const DEFAULT_PATH: SourcePath = "keep";

/** Below this the round can't clear; the gate caps a poisoned output here. */
export const GATE_CAP = 0.5;
/**
 * A critical source whose residual errors stay at or above this fraction of its
 * volume is still poisoning the output → trips the gate.
 */
export const POISON_FRACTION = 0.4;

/** Per-item error rates a path yields for a source of a given kind. */
export interface ErrorRates {
  /** AI misreads from messy / wrong-type input fed in as-is. */
  ai: number;
  /** Residual mistakes from a (partly manual) migration / re-key. */
  human: number;
  /** Needed data dropped (exclude) or not re-processed (redirect). */
  omission: number;
}

const r = (ai: number, human: number, omission: number): ErrorRates => ({
  ai,
  human,
  omission,
});

/**
 * The heart of the model: for each source kind, the per-item error rates of each
 * path. Tuned so the intended best path is the clear argmin, doing nothing
 * (keep) is the bad baseline where a fix is needed, and migrating something that
 * didn't need it costs HUMAN errors (so over-migration loses on errors, not just
 * effort). `redirect` on a source whose history is needed leaves an omission
 * gap; on a non-ongoing store it behaves like leaving the data unprocessed.
 */
const RATES: Record<SourceKind, Record<SourcePath, ErrorRates>> = {
  // Already structured & clean — just keep feeding it.
  "clean-structured": {
    keep: r(0.01, 0, 0), //  .01  ✅
    redirect: r(0.01, 0.01, 0), //  .02  pointless re-plumbing
    migrate: r(0.01, 0.05, 0), //  .06  needless human conversion
    exclude: r(0, 0, 0.6), //  .60  dropped needed data
  },
  // Messy live channel (e.g. queries via email) whose old data isn't needed.
  "messy-ongoing-no-history": {
    keep: r(0.24, 0, 0), //  .24  the bad baseline
    redirect: r(0.01, 0, 0), //  .01  ✅ cut over, don't reprocess old
    migrate: r(0.01, 0.05, 0), //  .06  works, but needless human cost
    exclude: r(0, 0, 0.45), //  .45  killed a live function
  },
  // Messy / incomplete store you DO need (e.g. db with blank key fields).
  "messy-historical-needed": {
    keep: r(0.45, 0, 0), //  .45  poison — bad data feeds the step
    redirect: r(0.01, 0, 0.5), //  .51  cut over loses the needed history
    migrate: r(0.02, 0.05, 0), //  .07  ✅ backfill / convert it
    exclude: r(0, 0, 0.55), //  .55  dropped needed data
  },
  // Wrong data TYPE but needed (scanned PDFs / audio for a text step).
  "unusable-type-needed": {
    keep: r(0.6, 0, 0), //  .60  poison — AI can't read the type
    redirect: r(0.01, 0, 0.5), //  .51  can't cut over a fixed archive
    migrate: r(0.03, 0.06, 0), //  .09  ✅ convert (OCR/transcribe)
    exclude: r(0, 0, 0.5), //  .50  dropped needed data
  },
  // Wrong-scope / duplicate / out-of-period — doesn't belong at all.
  irrelevant: {
    keep: r(0.32, 0, 0), //  .32  injects wrong-scope data
    redirect: r(0.3, 0.01, 0), //  .31  still forwards wrong data
    migrate: r(0.3, 0.05, 0), //  .35  cleaned data that shouldn't be in scope
    exclude: r(0, 0, 0), //  .00  ✅ leave it out
  },
  // Wrong-type AND low-value — migrating it doesn't pay off (boss trap).
  "unusable-not-worth": {
    keep: r(0.5, 0, 0), //  .50  unusable type poisons if kept
    redirect: r(0, 0, 0.06), //  .06  ≈ leaving it out (non-ongoing)
    migrate: r(0.03, 0.07, 0), //  .10  big effort for little — worse than dropping
    exclude: r(0, 0, 0.05), //  .05  ✅ low value lost, fine
  },
};

/** Critical sources can poison the whole output if mishandled → drive the gate. */
const CRITICAL_KINDS: ReadonlySet<SourceKind> = new Set([
  "clean-structured",
  "messy-historical-needed",
  "unusable-type-needed",
]);

export function isCriticalKind(kind: SourceKind): boolean {
  return CRITICAL_KINDS.has(kind);
}

/** Total per-item error rate of a path for a kind. */
function rateTotal(kind: SourceKind, path: SourcePath): number {
  const e = RATES[kind][path];
  return e.ai + e.human + e.omission;
}

/** The lowest-error path for a kind (tie-break: least human effort). */
export function bestPathForKind(kind: SourceKind): SourcePath {
  let best: SourcePath = "keep";
  let bestTotal = Infinity;
  let bestHuman = Infinity;
  for (const path of ALL_PATHS) {
    const total = rateTotal(kind, path);
    const human = RATES[kind][path].human;
    if (total < bestTotal - 1e-9 || (Math.abs(total - bestTotal) < 1e-9 && human < bestHuman)) {
      best = path;
      bestTotal = total;
      bestHuman = human;
    }
  }
  return best;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n);

/** The minimum a source needs to be graded / simulated. */
export interface GradeSource {
  id: string;
  kind: SourceKind;
  /** Items per quarter flowing through this source. */
  volume: number;
}

/** A source's error tally under one path, broken out by cause. */
export interface SourceErrors {
  ai: number;
  human: number;
  omission: number;
  total: number;
}

/** Compute a source's errors under a path (rates × volume). */
export function errorsFor(source: GradeSource, path: SourcePath): SourceErrors {
  const e = RATES[source.kind][path];
  const ai = e.ai * source.volume;
  const human = e.human * source.volume;
  const omission = e.omission * source.volume;
  return { ai, human, omission, total: ai + human + omission };
}

/** One column of the simulation (a whole-pipeline run under one strategy). */
export interface SimColumn {
  ai: number;
  human: number;
  omission: number;
  total: number;
}

function emptyColumn(): SimColumn {
  return { ai: 0, human: 0, omission: 0, total: 0 };
}

function addInto(col: SimColumn, e: SourceErrors): void {
  col.ai += e.ai;
  col.human += e.human;
  col.omission += e.omission;
  col.total += e.total;
}

function roundColumn(col: SimColumn): SimColumn {
  return {
    ai: round(col.ai),
    human: round(col.human),
    omission: round(col.omission),
    total: round(col.total),
  };
}

export interface GradedClean {
  scoreRatio: number;
  /** 0–1: how close the player's residual errors got to the best achievable. */
  errorReduction: number;
  exceptional: boolean;
  /** Whether a critical source was left poisoning the output (the gate trip). */
  gateTripped: boolean;
  /** Sources whose best path the player picked. */
  bestPicks: number;
  /** Sources where the player spent migration effort that didn't pay off. */
  overMigrated: number;
  /** Critical sources left in a poisoning state. */
  poisonedSources: number;
  sourcesTotal: number;
  /** The full three-way simulation, for display. */
  simulation: PipelineSimulation;
}

/** Three whole-pipeline runs compared side by side. */
export interface PipelineSimulation {
  /** Do nothing — every source kept as-is (the status-quo output). */
  baseline: SimColumn;
  /** The player's chosen paths. */
  yours: SimColumn;
  /** The lowest-error achievable — every source on its best path. */
  best: SimColumn;
}

/**
 * Run the pipeline three ways and grade the player's choices. Pure: the route
 * and any client preview both call this so the displayed maths matches the
 * score. Missing paths default to `keep` (do nothing).
 */
export function gradeCleanThePipe(
  sources: GradeSource[],
  paths: Record<string, SourcePath>,
): GradedClean {
  const baseline = emptyColumn();
  const yours = emptyColumn();
  const best = emptyColumn();

  let gateTripped = false;
  let bestPicks = 0;
  let overMigrated = 0;
  let poisonedSources = 0;

  for (const s of sources) {
    const chosen = paths[s.id] ?? DEFAULT_PATH;
    const bestPath = bestPathForKind(s.kind);

    const keepErr = errorsFor(s, "keep");
    const chosenErr = errorsFor(s, chosen);
    const bestErr = errorsFor(s, bestPath);

    addInto(baseline, keepErr);
    addInto(yours, chosenErr);
    addInto(best, bestErr);

    if (chosen === bestPath) bestPicks += 1;

    // Migration effort that didn't pay off (chose migrate but best was cheaper).
    if (chosen === "migrate" && bestPath !== "migrate") overMigrated += 1;

    // Gate: a critical (needed) source whose residual errors are still
    // poison-level is corrupting the output.
    if (isCriticalKind(s.kind) && chosenErr.total >= POISON_FRACTION * s.volume) {
      gateTripped = true;
      poisonedSources += 1;
    }
  }

  const span = baseline.total - best.total;
  const errorReduction = span > 1e-9 ? clamp01((baseline.total - yours.total) / span) : 1;

  let scoreRatio = errorReduction;
  if (gateTripped) scoreRatio = Math.min(scoreRatio, GATE_CAP);
  scoreRatio = clamp01(scoreRatio);

  return {
    scoreRatio,
    errorReduction,
    exceptional: !gateTripped && bestPicks === sources.length,
    gateTripped,
    bestPicks,
    overMigrated,
    poisonedSources,
    sourcesTotal: sources.length,
    simulation: {
      baseline: roundColumn(baseline),
      yours: roundColumn(yours),
      best: roundColumn(best),
    },
  };
}

// ===================== Per-source debrief read =====================

/** How a single source's choice played out, for the debrief. */
export type SourceVerdict = "best" | "ok" | "poisoned" | "wasteful";

export function sourceVerdict(
  kind: SourceKind,
  chosen: SourcePath,
  volume: number,
): SourceVerdict {
  const bestPath = bestPathForKind(kind);
  if (chosen === bestPath) return "best";
  const chosenErr = errorsFor({ id: "_", kind, volume }, chosen);
  if (isCriticalKind(kind) && chosenErr.total >= POISON_FRACTION * volume) {
    return "poisoned";
  }
  // Spent effort (migrate) or otherwise raised errors without a payoff.
  if (chosen === "migrate") return "wasteful";
  return "ok";
}
