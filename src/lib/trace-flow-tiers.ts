/**
 * Shape tiers for "Trace the Flow" (Act Three, game 1 — the literacy floor).
 *
 * The five rounds escalate not in *risk* (that's In the Loop) but in the SHAPE
 * of the workflow the player has to reconstruct — from a clean straight line, to
 * a line with a broken hand-off, to genuinely non-linear shapes (a parallel
 * branch, a loop-back). This mirrors the Act Three learning outcome: "break
 * opaque work into discrete input→output steps; detect broken hand-offs;
 * recognise parallel branches and loop-backs."
 *
 * Pure and dependency-free so it can be shared by the client component, the
 * generator and the scoring/route code alike (same pattern as
 * `checkpoint-tiers.ts`).
 */

export type ShapeTier = "clean" | "break" | "reformat" | "parallel" | "loopback";

/** The structural shape a round's workflow takes. */
export type FlowShape = "linear" | "parallel" | "loopback";

/** How a broken hand-off fails, when a round has one. */
export type BreakKind = "none" | "lost" | "reformatted";

export interface ShapeTierInfo {
  tier: ShapeTier;
  /** Short badge label shown on the round. */
  label: string;
  /** The structural shape of the workflow. */
  shape: FlowShape;
  /** Whether this tier plants a broken hand-off, and of what kind. */
  breakKind: BreakKind;
  /** One-line framing shown to the player on the round (tells them the shape to hunt for). */
  note: string;
  /** Guidance handed to the generator about how to shape the workflow. */
  guidance: string;
}

/**
 * Map a round difficulty (1-5) to a shape tier:
 * - 1 → clean    (straight line, every hand-off sound)
 * - 2 → break    (straight line, one hand-off drops information)
 * - 3 → reformat (straight line, one hand-off mangles/reformats information — subtler)
 * - 4 → parallel (a branch runs alongside the main chain)
 * - 5 → loopback (a rework loop sends work back for another pass)
 */
export function tierForDifficulty(difficulty: number): ShapeTier {
  if (difficulty <= 1) return "clean";
  if (difficulty <= 2) return "break";
  if (difficulty <= 3) return "reformat";
  if (difficulty <= 4) return "parallel";
  return "loopback";
}

export const SHAPE_TIER_INFO: Record<ShapeTier, ShapeTierInfo> = {
  clean: {
    tier: "clean",
    label: "Straight line",
    shape: "linear",
    breakKind: "none",
    note: "A clean, straight-line workflow. Put the steps in the order the work actually happens — read each step's needs/produces to find what comes next.",
    guidance:
      "This is a WARM-UP round: a clean, linear workflow of 4 steps. Every hand-off is sound — each step's `input` matches the previous step's `output`. Plant NO broken hand-offs (set brokenHandoffs to []), NO parallel branch and NO loop-back. The only task is ordering, so make the order unambiguous from the inputs/outputs.",
  },
  break: {
    tier: "break",
    label: "Mind the hand-off",
    shape: "linear",
    breakKind: "lost",
    note: "A straight line — but somewhere a hand-off DROPS information. Order the steps, then flag the broken link where a step's input is missing something the step before it produced.",
    guidance:
      "This is a LINEAR workflow of 4-5 steps with exactly ONE broken hand-off where information is LOST: the downstream step's `input` is missing a key detail the upstream step's `output` contained (e.g. upstream produces 'signed form with the £7,000 amount' but the next step works from just 'the form', losing the amount). Every other hand-off must be sound. The order must still be inferable. Mark that one boundary in brokenHandoffs with a clear `reason`.",
  },
  reformat: {
    tier: "reformat",
    label: "Reformatted in transit",
    shape: "linear",
    breakKind: "reformatted",
    note: "A straight line — but a hand-off REFORMATS information into the wrong shape, so the next step can't use it cleanly. Order the steps and flag that broken link.",
    guidance:
      "This is a LINEAR workflow of 4-5 steps with exactly ONE broken hand-off where information is REFORMATTED/MANGLED rather than lost: the upstream `output` and the downstream `input` describe the same thing in INCOMPATIBLE shapes (e.g. upstream produces 'a PDF scan of the invoice' but the next step needs 'line-item figures in the spreadsheet', so the data is there but unusable as handed over). This is subtler than losing information. Every other hand-off is sound. Mark that one boundary in brokenHandoffs with a clear `reason`.",
  },
  parallel: {
    tier: "parallel",
    label: "Parallel branch",
    shape: "parallel",
    breakKind: "lost",
    note: "Not every workflow is a straight line. Two of these steps run in PARALLEL — alongside the main chain, not one after the other. Order the steps, mark the parallel pair, and flag any broken hand-off.",
    guidance:
      "This workflow has a PARALLEL BRANCH: exactly TWO steps run alongside each other (neither feeds the other — they both take the same upstream input and run independently before the chain rejoins). Put those two steps in the same `parallelGroup` (e.g. 'pg1'); they sit next to each other in the canonical order but their internal order does not matter. Use 5-6 steps total. Also plant ONE broken hand-off (information lost) somewhere in the MAIN chain, with a `reason`. Make the two parallel steps genuinely independent so a careful reader can tell they don't hand off to each other.",
  },
  loopback: {
    tier: "loopback",
    label: "Loop-back",
    shape: "loopback",
    breakKind: "lost",
    note: "The boss round. This workflow has a REWORK LOOP — a step that sends work back to an earlier step for another pass ('if rejected, return to…'). Order the steps, identify the loop-back, and flag the broken hand-off.",
    guidance:
      "This workflow has a LOOP-BACK: exactly ONE step, on a failure/rejection, sends the work back to an EARLIER step for another pass (e.g. a review step that returns rejected items to the revise step). Express it with loopBackFromIndex (the step that sends work back) and loopBackToIndex (the earlier step it returns to), as canonical indices, with loopBackToIndex < loopBackFromIndex. Use 5-6 steps total. Also plant ONE broken hand-off (information lost) elsewhere in the chain, with a `reason`. No parallel branch in this round.",
  },
};

export function tierInfoForDifficulty(difficulty: number): ShapeTierInfo {
  return SHAPE_TIER_INFO[tierForDifficulty(difficulty)];
}
