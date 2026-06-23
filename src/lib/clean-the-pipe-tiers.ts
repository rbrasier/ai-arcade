/**
 * Difficulty shaping for "Clean the Pipe" (input hygiene).
 *
 * The five rounds escalate the kind of dirt and how tempting it is to
 * over-clean — and, from round 4, introduce abstract SOURCES whose data type
 * doesn't suit the system, where the player must weigh leaving the data as-is
 * against migrating it (which costs real effort). Round 4 plants ONE such
 * source; round 5 (the boss) plants TWO — one worth migrating and one tolerable
 * mismatch best left alone — so the player must spend migration effort only
 * where it pays off.
 *
 * Pure and dependency-free so it can be shared by the client component, the
 * generator and the route code alike.
 */

export interface PipeTierInfo {
  /** Short label shown on the round. */
  label: string;
  /** One-line framing used in copy and the round intro. */
  note: string;
  /** Whether this round includes type-mismatched sources at all. */
  hasSources: boolean;
  /** Guidance handed to the generator about how to shape the round's dirt. */
  guidance: string;
}

export const PIPE_TIERS: Record<number, PipeTierInfo> = {
  1: {
    label: "Warm-up",
    note: "One obvious bad record among clean ones — get the feel for triaging before you run.",
    hasSources: false,
    guidance:
      "WARM-UP round. Provide 5-6 records. Make exactly ONE record clearly consequential (it would visibly skew the output) and set its correctAction to 'drop' or 'fix' as fits. Every other record is genuinely fine (consequential false, correctAction 'keep'). No mismatched sources this round.",
  },
  2: {
    label: "Duplicates & blanks",
    note: "Lots of cosmetic dirt — duplicates, blank fields — but only some of it actually matters.",
    hasSources: false,
    guidance:
      "Provide 6-7 records. Include several HARMLESS bits of dirt — an exact duplicate, a record with a blank non-essential field, a trivial format inconsistency — all consequential false / correctAction 'keep' (cleaning them only wastes effort). Plant ONE consequential record (e.g. a blank in the field the step actually needs → 'fix', or a corrupt row → 'drop'). No mismatched sources this round.",
  },
  3: {
    label: "Stale record",
    note: "A stale, out-of-date entry that quietly flips the result — amid tempting but harmless dirt.",
    hasSources: false,
    guidance:
      "Provide 6-7 records. Plant ONE clearly consequential record that would flip or skew the output (a stale/out-of-date entry, or an entry that is actually a different category) → correctAction 'drop'. Optionally one consequential record that is recoverable → 'fix'. Surround them with TEMPTING but harmless dirt (duplicates, cosmetic format diffs) that should be left ('keep'). No mismatched sources this round.",
  },
  4: {
    label: "A source that doesn't fit",
    note: "A whole source arrives in the wrong shape for the system. Leave it as-is, or migrate it — for a cost.",
    hasSources: true,
    guidance:
      "Provide 5-6 records with a MIX of harmless dirt ('keep') and 1-2 consequential records ('fix' or 'drop'). Then add EXACTLY ONE mismatched source: an abstract source whose data TYPE doesn't suit the system (e.g. scanned PDFs where structured fields are needed, free-text notes where a date field is expected, a different-schema export). This source IS consequential — its mismatch would break or badly degrade the output — so correctAction is 'migrate'. Give it a realistic migrationEffort in hours (e.g. 6-16) and a plain 'mismatch' line a non-technical reader can understand. The lesson: migration costs real effort, but here it's worth it.",
  },
  5: {
    label: "Boss round",
    note: "Two ill-fitting sources now. One is worth migrating; the other isn't. Spend effort where it pays.",
    hasSources: true,
    guidance:
      "BOSS round. Provide 6-7 records mixing harmless dirt ('keep') with 1-2 consequential records ('fix' or 'drop'). Then add EXACTLY TWO mismatched sources whose data types don't suit the system. ONE is consequential and worth migrating (correctAction 'migrate') — its mismatch would wreck the output. The OTHER is a tolerable mismatch (consequential false, correctAction 'leave'): the model can cope with it, or it is low-value, so its large migrationEffort is NOT worth paying — migrating it just burns effort. Give the worth-it source a moderate migrationEffort and the tolerable one a notably LARGER migrationEffort, so leaving it is the calibrated call. Make both 'mismatch' lines plausible and tempting.",
  },
};

export function pipeTierForDifficulty(difficulty: number): PipeTierInfo {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return PIPE_TIERS[d];
}
