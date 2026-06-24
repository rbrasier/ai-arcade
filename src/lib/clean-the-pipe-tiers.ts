/**
 * Difficulty shaping for "Clean the Pipe" (data-integration design).
 *
 * Every round hands the player a set of whole DATA SOURCES feeding an AI step,
 * each handled with one of four paths (keep / redirect / migrate / exclude). The
 * five rounds escalate from a single clear "fix the channel going forward"
 * decision to a desk full of historical sources each needing its own migration
 * call — and a boss round that plants a tempting-but-not-worth-it migration so
 * the player must spend conversion effort only where it pays off.
 *
 * Pure and dependency-free so it can be shared by the client component, the
 * generator and the route code alike.
 */

import type { SourceKind } from "./clean-the-pipe-scoring";

export interface PipeTierInfo {
  /** Short label shown on the round. */
  label: string;
  /** One-line framing used in copy and the round intro. */
  note: string;
  /** The source kinds this round should be built from (length = source count). */
  kinds: SourceKind[];
  /** Guidance handed to the generator about how to shape the round. */
  guidance: string;
}

export const PIPE_TIERS: Record<number, PipeTierInfo> = {
  1: {
    label: "Fix the channel",
    note: "Messy data is arriving live. Redirect the intake so new data comes structured — and don't waste time on what doesn't matter.",
    kinds: ["messy-ongoing-no-history", "clean-structured", "irrelevant"],
    guidance:
      "WARM-UP. Provide EXACTLY 3 sources. (1) An ONGOING messy channel whose old data is NOT needed — e.g. customer queries arriving as free-text emails — kind 'messy-ongoing-no-history' (the answer is to REDIRECT: cut the intake over to a structured form going forward, no need to re-process old mail). (2) A clean, already-structured source the step needs — kind 'clean-structured' (KEEP). (3) A clearly wrong-scope or duplicate source — kind 'irrelevant' (EXCLUDE). Keep it simple and obvious.",
  },
  2: {
    label: "First migration",
    note: "Most of it is fine — but one store you rely on is messy and needs converting before the step can trust it.",
    kinds: ["clean-structured", "messy-historical-needed", "messy-ongoing-no-history"],
    guidance:
      "Provide EXACTLY 3 sources: one 'clean-structured' (KEEP), one 'messy-historical-needed' — an existing store the step NEEDS but whose data is messy/incomplete, e.g. a spreadsheet with inconsistent columns (the answer is MIGRATE: convert/backfill it), and one 'messy-ongoing-no-history' live channel (REDIRECT). Make clear which data is actually needed.",
  },
  3: {
    label: "Sort the desk",
    note: "Four sources, four different right answers. Keep, redirect, migrate, or drop — read each one.",
    kinds: [
      "clean-structured",
      "messy-historical-needed",
      "messy-ongoing-no-history",
      "irrelevant",
    ],
    guidance:
      "Provide EXACTLY 4 sources, one of EACH kind: 'clean-structured' (KEEP), 'messy-historical-needed' (MIGRATE), 'messy-ongoing-no-history' (REDIRECT), and 'irrelevant' (EXCLUDE — wrong period / duplicate / out of scope). Make the right call inferable from each source's contents and what the step uses it for, not from its position.",
  },
  4: {
    label: "Migration day",
    note: "Two spreadsheets, a database with key fields missing, and an inbox — choose a migration path for each to turn old data into usable structured data.",
    kinds: [
      "messy-historical-needed",
      "messy-historical-needed",
      "unusable-type-needed",
      "messy-ongoing-no-history",
      "clean-structured",
    ],
    guidance:
      "HARD round. Provide EXACTLY 5 sources matching the user's brief: TWO different spreadsheets that are 'messy-historical-needed' (MIGRATE — e.g. one with inconsistent columns, one with mixed currencies/formats), a DATABASE with key fields blank that is also needed — use kind 'unusable-type-needed' OR 'messy-historical-needed' (MIGRATE/backfill), an email inbox that is 'messy-ongoing-no-history' (REDIRECT), and one 'clean-structured' system the step already reads fine (KEEP). Most sources need a migration decision here.",
  },
  5: {
    label: "Boss round",
    note: "One more ill-fitting source than you have appetite for. Migrate only what pays off — leave the one that doesn't.",
    kinds: [
      "messy-historical-needed",
      "unusable-type-needed",
      "unusable-not-worth",
      "messy-ongoing-no-history",
      "clean-structured",
    ],
    guidance:
      "BOSS round. Provide EXACTLY 5 sources: a 'messy-historical-needed' store (MIGRATE), an 'unusable-type-needed' source — wrong data TYPE but genuinely needed, e.g. scanned PDFs feeding a text step (MIGRATE: OCR/convert), and the TRAP: an 'unusable-not-worth' source — also the wrong type, with a LARGE migrationEffortHours, but low-value / redundant so the step copes fine without it (the right call is EXCLUDE; migrating it burns effort and human-error for nothing). Plus a 'messy-ongoing-no-history' channel (REDIRECT) and a 'clean-structured' system (KEEP). Make the trap genuinely tempting.",
  },
};

export function pipeTierForDifficulty(difficulty: number): PipeTierInfo {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return PIPE_TIERS[d];
}
