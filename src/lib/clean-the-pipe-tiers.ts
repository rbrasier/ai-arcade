/**
 * Difficulty shaping for "Clean the Pipe" (input hygiene).
 *
 * Every round is ONE triage queue of `items`, each triaged with the same three
 * verbs (pass / repair / bin). The five rounds escalate the kind of dirt and how
 * tempting it is to over-clean — and, from round 4, introduce `batch` items:
 * whole sources whose data type doesn't suit the system, where a repair is a
 * migration that costs real hours, so the player must weigh leaving the data as
 * it is against converting it. Round 4 plants ONE such batch; round 5 (the boss)
 * plants TWO — one worth migrating and one tolerable mismatch best left alone —
 * so the player must spend migration effort only where it pays off.
 *
 * Pure and dependency-free so it can be shared by the client component, the
 * generator and the route code alike.
 */

export interface PipeTierInfo {
  /** Short label shown on the round. */
  label: string;
  /** One-line framing used in copy and the round intro. */
  note: string;
  /** Whether this round includes type-mismatched batch items at all. */
  hasBatches: boolean;
  /** Guidance handed to the generator about how to shape the round's dirt. */
  guidance: string;
}

export const PIPE_TIERS: Record<number, PipeTierInfo> = {
  1: {
    label: "Warm-up",
    note: "One obvious bad row among clean ones — get the feel for triaging before you run.",
    hasBatches: false,
    guidance:
      "WARM-UP round. Provide 5-6 record items (kind 'record'). Make exactly ONE clearly consequential (it would visibly skew the output) and set its correctAction to 'bin' or 'repair' as fits. Every other item is genuinely fine (consequential false, correctAction 'pass'). No batch items this round.",
  },
  2: {
    label: "Duplicates & blanks",
    note: "Lots of cosmetic dirt — duplicates, blank fields — but only some of it actually matters.",
    hasBatches: false,
    guidance:
      "Provide 6-7 record items. Include several HARMLESS bits of dirt — an exact duplicate, a record with a blank non-essential field, a trivial format inconsistency — all consequential false / correctAction 'pass' (cleaning them only wastes effort). Plant ONE consequential row: a blank in the field the step actually needs → 'repair' (give it a repairedContent), or a corrupt/duplicate row that double-counts → 'bin'. No batch items this round.",
  },
  3: {
    label: "Stale record",
    note: "A stale, out-of-date entry that quietly flips the result — amid tempting but harmless dirt.",
    hasBatches: false,
    guidance:
      "Provide 6-7 record items. Plant ONE clearly consequential row that would flip or skew the output (a stale/out-of-date entry, or an entry that is actually a different category) → correctAction 'bin'. Optionally one consequential row that is recoverable → 'repair' (with a repairedContent). Surround them with TEMPTING but harmless dirt (duplicates, cosmetic format diffs) that should be left ('pass'). No batch items this round.",
  },
  4: {
    label: "A source that doesn't fit",
    note: "A whole source arrives in the wrong shape for the system. Pass it, repair (migrate) it for a cost, or bin it.",
    hasBatches: true,
    guidance:
      "Provide 5-6 record items with a MIX of harmless dirt ('pass') and 1-2 consequential rows ('repair' or 'bin'). Then add EXACTLY ONE 'batch' item: an abstract source whose data TYPE doesn't suit the system (e.g. scanned PDFs where structured fields are needed, free-text notes where a date field is expected, a different-schema export). This batch IS consequential — its mismatch would break or badly degrade the output — so correctAction is 'repair' (a migration). Give it a realistic migrationEffort in hours (e.g. 6-16), a plain 'content' mismatch line a non-technical reader can understand, and a repairedContent describing the converted shape. The lesson: a batch repair costs real effort, but here it's worth it.",
  },
  5: {
    label: "Boss round",
    note: "Two ill-fitting sources now. One is worth migrating; the other isn't. Spend effort where it pays.",
    hasBatches: true,
    guidance:
      "BOSS round. Provide 6-7 record items mixing harmless dirt ('pass') with 1-2 consequential rows ('repair' or 'bin'). Then add EXACTLY TWO 'batch' items whose data types don't suit the system. ONE is consequential and worth migrating (correctAction 'repair') — its mismatch would wreck the output. The OTHER is a tolerable mismatch (consequential false, correctAction 'pass'): the model can cope with it, or it is low-value, so its large migrationEffort is NOT worth paying — repairing it just burns effort. Give the worth-it batch a moderate migrationEffort and the tolerable one a notably LARGER migrationEffort, so leaving it is the calibrated call. Make both 'content' mismatch lines plausible and tempting, and give each a repairedContent.",
  },
};

export function pipeTierForDifficulty(difficulty: number): PipeTierInfo {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return PIPE_TIERS[d];
}
