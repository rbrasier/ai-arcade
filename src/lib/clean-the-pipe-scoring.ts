/**
 * Pure, dependency-free scoring helpers for "Clean the Pipe" (input hygiene).
 *
 * Imports nothing from the AI connector or the server runtime so it can be
 * shared by BOTH the scoring route (server) and the game component (client) —
 * the official score and any preview use the same maths.
 *
 * THE MODEL IS A SINGLE TRIAGE QUEUE. Every input the AI is about to ingest —
 * whether a data `record` (a row) or a whole `batch` (a source whose data TYPE
 * doesn't suit the system) — is triaged with the SAME three verbs:
 *
 *   pass    – let it through untouched   (correct for clean rows / harmless dirt
 *                                          / a tolerable batch mismatch)
 *   repair  – fix the row in place, or convert the batch into a usable shape
 *             (recover the data; the heavier clean-out — a batch repair is a
 *             migration that costs real effort)
 *   bin     – leave it out of the run (drop a wrong-category/unrecoverable row,
 *             or exclude an ill-fitting batch; cheaper than repair, but the data
 *             is lost)
 *
 * Scoring model (see docs/GAME-RULES.md): two axes per round, graded against the
 * stored ground truth of every item. The game is the input-side mirror of Spot
 * the Hallucination, so accuracy is a per-item gradient just like that game's
 * per-claim credit.
 *
 *   accuracy = creditSum / consequentialTotal        (the GATE)
 *   effort   = 1 - wastedEffort / maxWaste           (the mastery axis)
 *   scoreRatio = 0.5 * accuracy + 0.5 * effort
 *
 * ACCURACY (catch what poisons the output). Every item that genuinely changes
 * the output is "consequential". Per consequential item:
 *   - handled with the right action            → 1.0
 *   - addressed, but with the other clean-out  → 0.5  (poison neutralised, but
 *     handled suboptimally — binned a row that was recoverable, or excluded a
 *     batch that was worth converting, so you lost data you could have kept)
 *   - left to pass through                      → 0    (the poison slips through)
 * If ANY consequential item is left to pass, the round is capped at GATE_CAP
 * (0.5) — below the 65% clear — because the output is poisoned.
 *
 * EFFORT (spend effort only where it pays off — calibrate cleaning to
 * consequence, not tidiness). Each action carries an effort weight that depends
 * on the item kind — a `batch` repair is a migration, the heavy one. Waste =
 * effort spent on harmless items (over-cleaning a fine row, needlessly migrating
 * a tolerable batch) plus EXCESS effort on consequential items (e.g. repairing
 * where a cheap bin suffices). Normalised against the waste of an aggressive
 * "repair-everything" strategy, so that strategy lands near 0 and the ideal
 * triage scores 1. A batch repair's weight makes a needless migration dominate.
 *
 * Worked outcomes that pin the two lessons:
 *  - perfect triage                       → 1.0  (exceptional)
 *  - let a consequential item pass        → capped 0.5 (fails — output poisoned)
 *  - repair/bin everything (or migrate a  → effort → 0, drops out of the bonus
 *    tolerable batch)                        tiers (fails the "not all dirt is
 *                                            equal" lesson)
 */

/** What the player can do with any item in the queue. */
export type TriageAction = "pass" | "repair" | "bin";
/** The two kinds of input the queue can hold. */
export type ItemKind = "record" | "batch";

/** The do-nothing default action. */
export const DEFAULT_ACTION: TriageAction = "pass";

export const ACCURACY_WEIGHT = 0.5;
export const EFFORT_WEIGHT = 0.5;
/** Leaving any consequential item to pass caps the round here — below the 65% clear. */
export const GATE_CAP = 0.5;
/** Credit for neutralising a consequential item with the wrong clean-out. */
export const PARTIAL_CREDIT = 0.5;

/**
 * Effort weight of each action, by item kind. A `repair` recovers the data and
 * is the heavier clean-out; a `batch` repair is a migration, heavier still.
 */
const RECORD_EFFORT: Record<TriageAction, number> = { pass: 0, bin: 1, repair: 2 };
const BATCH_EFFORT: Record<TriageAction, number> = { pass: 0, bin: 2, repair: 4 };

/** Effort weight for an action on a given item kind. */
export function actionEffort(kind: ItemKind, action: TriageAction): number {
  return (kind === "batch" ? BATCH_EFFORT : RECORD_EFFORT)[action];
}

/** The most effort any single item of this kind can cost (an aggressive repair). */
function maxItemEffort(kind: ItemKind): number {
  return actionEffort(kind, "repair");
}

export interface GradeItem {
  id: string;
  kind: ItemKind;
  consequential: boolean;
  correctAction: TriageAction;
}

export interface GradedClean {
  accuracy: number;
  effort: number;
  scoreRatio: number;
  exceptional: boolean;
  /** Consequential items that were left to pass through (the gate trip). */
  missedConsequential: number;
  consequentialTotal: number;
  /** Items handled with the right action (full credit). */
  cleanCorrect: number;
  /** Effort spent where it did not pay off (over-cleaning / needless migration / excess). */
  overCleaned: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Grade a round's triage against the labelled items. Pure: the route and any
 * client preview both call this so the displayed maths matches the score.
 * Missing actions default to `pass` (do nothing).
 */
export function gradeCleanThePipe(
  items: GradeItem[],
  actions: Record<string, TriageAction>,
): GradedClean {
  let consequentialTotal = 0;
  let creditSum = 0;
  let missedConsequential = 0;
  let cleanCorrect = 0;
  let wasted = 0;
  let maxWaste = 0;
  let overCleaned = 0;

  for (const item of items) {
    const action = actions[item.id] ?? DEFAULT_ACTION;
    const eff = actionEffort(item.kind, action);
    if (item.consequential) {
      consequentialTotal += 1;
      const correctEff = actionEffort(item.kind, item.correctAction);
      if (action === item.correctAction) {
        creditSum += 1;
        cleanCorrect += 1;
      } else if (action === "pass") {
        missedConsequential += 1;
      } else {
        // Neutralised the poison, but with the other clean-out method.
        creditSum += PARTIAL_CREDIT;
      }
      // Over-investing on a consequential item (e.g. repair where a bin suffices).
      const excess = Math.max(0, eff - correctEff);
      wasted += excess;
      if (excess > 0) overCleaned += 1;
      maxWaste += Math.max(0, maxItemEffort(item.kind) - correctEff);
    } else {
      // Harmless: passing it is correct, so any effort spent is pure waste.
      wasted += eff;
      if (eff > 0) overCleaned += 1;
      maxWaste += maxItemEffort(item.kind);
    }
  }

  const accuracy = consequentialTotal > 0 ? creditSum / consequentialTotal : 1;
  const effort = maxWaste > 0 ? clamp01(1 - wasted / maxWaste) : 1;
  const gateTripped = missedConsequential > 0;

  let scoreRatio = ACCURACY_WEIGHT * accuracy + EFFORT_WEIGHT * effort;
  if (gateTripped) scoreRatio = Math.min(scoreRatio, GATE_CAP);
  scoreRatio = clamp01(scoreRatio);

  return {
    accuracy,
    effort,
    scoreRatio,
    exceptional: !gateTripped && accuracy >= 1 && effort >= 1,
    missedConsequential,
    consequentialTotal,
    cleanCorrect,
    overCleaned,
  };
}

// ===================== Consequences read (feedback only) =====================

/** How good the AI's output is once the data has (or hasn't) been triaged. */
export type QualityBand = "sound" | "degraded" | "poisoned";

/** Nominal human minutes a record-level action costs, for the effort read. */
const RECORD_MINUTES: Record<TriageAction, number> = { pass: 0, bin: 1, repair: 5 };
/** Nominal hours a batch-level action costs (repair uses the item's migrationEffort). */
const BATCH_BIN_HOURS = 0.5;

export interface ImpactItem {
  id: string;
  kind: ItemKind;
  consequential: boolean;
  correctAction: TriageAction;
  /** Hours it takes to repair (migrate) this item — batches only; shown to the player. */
  migrationEffort?: number;
}

export interface CleanThePipeImpact {
  /** Output quality if the step were run on the raw data, untouched. */
  rawQuality: QualityBand;
  /** Output quality from the player's triaged data. */
  yourQuality: QualityBand;
  /** Hours the player spent cleaning + migrating. */
  effortHours: number;
  /** Hours the ideal triage would have cost — the calibrated target. */
  idealEffortHours: number;
  consequentialTotal: number;
  consequentialAddressed: number;
  verdict: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Project what the player's triage did, in plain quality + effort terms — the
 * signature "raw vs cleaned" read the game is built around (the same "what it
 * produced" idea as Prompt Golf). Feedback only; never affects the score.
 */
export function computeCleanThePipeImpact(
  items: ImpactItem[],
  actions: Record<string, TriageAction>,
): CleanThePipeImpact {
  let consequentialTotal = 0;
  let consequentialAddressed = 0;
  let anyDegraded = false;
  let gateTripped = false;
  let effortHours = 0;
  let idealHours = 0;

  const actionHours = (item: ImpactItem, action: TriageAction): number => {
    if (item.kind === "batch") {
      if (action === "repair") return item.migrationEffort ?? 0;
      if (action === "bin") return BATCH_BIN_HOURS;
      return 0;
    }
    return RECORD_MINUTES[action] / 60;
  };

  for (const item of items) {
    const action = actions[item.id] ?? DEFAULT_ACTION;
    effortHours += actionHours(item, action);
    if (item.consequential) {
      consequentialTotal += 1;
      idealHours += actionHours(item, item.correctAction);
      if (action === "pass") gateTripped = true;
      else {
        consequentialAddressed += 1;
        if (action !== item.correctAction) anyDegraded = true;
      }
    }
  }

  const rawQuality: QualityBand = consequentialTotal > 0 ? "poisoned" : "sound";
  const yourQuality: QualityBand = gateTripped
    ? "poisoned"
    : anyDegraded
      ? "degraded"
      : "sound";

  const effortHoursR = round1(effortHours);
  const idealHoursR = round1(idealHours);

  let verdict: string;
  if (gateTripped) {
    verdict =
      "Bad data still flowed into the step, so the output is poisoned — the effort you saved isn't worth a broken result.";
  } else if (yourQuality === "degraded") {
    verdict =
      "The output holds up, though you discarded data you could have recovered — cheaper isn't always better.";
  } else if (effortHoursR > idealHoursR + 0.1) {
    verdict =
      "Clean output — but you spent more effort than the result needed. Not all dirt is worth chasing.";
  } else {
    verdict =
      "Clean output for calibrated effort — you fixed what mattered and left the rest alone.";
  }

  return {
    rawQuality,
    yourQuality,
    effortHours: effortHoursR,
    idealEffortHours: idealHoursR,
    consequentialTotal,
    consequentialAddressed,
    verdict,
  };
}
