/**
 * Pure, dependency-free scoring helpers for "Clean the Pipe" (input hygiene).
 *
 * Imports nothing from the AI connector or the server runtime so it can be
 * shared by BOTH the scoring route (server) and the game component (client) —
 * the official score and any preview use the same maths.
 *
 * Scoring model (see docs/GAME-RULES.md): two axes per round, graded against the
 * stored ground truth of every input item (data records, plus — on the harder
 * rounds — abstract sources whose data TYPE doesn't suit the system). The game
 * is the input-side mirror of Spot the Hallucination, so accuracy is a per-item
 * gradient just like that game's per-claim credit.
 *
 *   accuracy = creditSum / consequentialTotal        (the GATE)
 *   effort   = 1 - wastedEffort / maxWaste           (the mastery axis)
 *   scoreRatio = 0.5 * accuracy + 0.5 * effort
 *
 * ACCURACY (catch what poisons the output). Every item that genuinely changes
 * the output is "consequential". Per consequential item:
 *   - handled with the right action            → 1.0
 *   - addressed, but with the other clean-out  → 0.5  (poison neutralised, but
 *     handled suboptimally — e.g. dropped data that was recoverable)
 *   - left untouched (keep / leave)            → 0    (the poison slips through)
 * If ANY consequential item is left untouched, the round is capped at GATE_CAP
 * (0.5) — below the 65% clear — because the output is poisoned.
 *
 * EFFORT (spend effort only where it pays off — calibrate cleaning to
 * consequence, not tidiness). Each action carries an effort weight
 * (keep/leave 0, drop 1, fix 2, migrate 4 — migration is deliberately the heavy
 * one). Waste = effort spent on harmless items (over-cleaning a fine record,
 * needlessly migrating a tolerable source) plus EXCESS effort on consequential
 * items (e.g. fixing where a cheap drop suffices). Normalised against the waste
 * of an aggressive "fix-everything / migrate-everything" strategy, so that
 * strategy lands near 0 and the ideal triage scores 1. Migration's weight makes
 * a needless migration dominate the penalty.
 *
 * Worked outcomes that pin the two lessons:
 *  - perfect triage                       → 1.0  (exceptional)
 *  - leave a consequential record/source  → capped 0.5 (fails — output poisoned)
 *  - fix/drop everything (or migrate a    → effort → 0, drops out of the bonus
 *    tolerable source)                       tiers (fails the "not all dirt is
 *                                            equal" lesson)
 */

/** What the player can do with a data record. */
export type RecordAction = "keep" | "fix" | "drop";
/** What the player can do with a type-mismatched source. */
export type SourceAction = "leave" | "migrate";

export const ACCURACY_WEIGHT = 0.5;
export const EFFORT_WEIGHT = 0.5;
/** Leaving any consequential item untouched caps the round here — below the 65% clear. */
export const GATE_CAP = 0.5;
/** Credit for neutralising a consequential record with the wrong clean-out method. */
export const PARTIAL_CREDIT = 0.5;

/** Effort weight of each action — migration is the expensive one. */
export const ACTION_EFFORT: Record<RecordAction | SourceAction, number> = {
  keep: 0,
  leave: 0,
  drop: 1,
  fix: 2,
  migrate: 4,
};

/** The most effort any single record can cost (an aggressive "fix it" call). */
const MAX_RECORD_EFFORT = ACTION_EFFORT.fix;
/** The most effort any single source can cost (an aggressive "migrate it" call). */
const MAX_SOURCE_EFFORT = ACTION_EFFORT.migrate;

export interface GradeRecord {
  id: string;
  consequential: boolean;
  correctAction: RecordAction;
}

export interface GradeSource {
  id: string;
  consequential: boolean;
  correctAction: SourceAction;
}

export interface GradedClean {
  accuracy: number;
  effort: number;
  scoreRatio: number;
  exceptional: boolean;
  /** Consequential items that were left fully untouched (the gate trip). */
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
 * Missing actions default to the do-nothing choice (record `keep`, source
 * `leave`).
 */
export function gradeCleanThePipe(
  records: GradeRecord[],
  sources: GradeSource[],
  recordActions: Record<string, RecordAction>,
  sourceActions: Record<string, SourceAction>,
): GradedClean {
  let consequentialTotal = 0;
  let creditSum = 0;
  let missedConsequential = 0;
  let cleanCorrect = 0;
  let wasted = 0;
  let maxWaste = 0;
  let overCleaned = 0;

  for (const r of records) {
    const action = recordActions[r.id] ?? "keep";
    const eff = ACTION_EFFORT[action];
    if (r.consequential) {
      consequentialTotal += 1;
      const correctEff = ACTION_EFFORT[r.correctAction];
      if (action === r.correctAction) {
        creditSum += 1;
        cleanCorrect += 1;
      } else if (action === "keep") {
        missedConsequential += 1;
      } else {
        // Neutralised the poison, but with the other clean-out method.
        creditSum += PARTIAL_CREDIT;
      }
      // Over-investing on a consequential record (e.g. fix where drop suffices).
      const excess = Math.max(0, eff - correctEff);
      wasted += excess;
      if (excess > 0) overCleaned += 1;
      maxWaste += Math.max(0, MAX_RECORD_EFFORT - correctEff);
    } else {
      // Harmless: leaving it is correct, so any effort spent is pure waste.
      wasted += eff;
      if (eff > 0) overCleaned += 1;
      maxWaste += MAX_RECORD_EFFORT;
    }
  }

  for (const s of sources) {
    const action = sourceActions[s.id] ?? "leave";
    const eff = ACTION_EFFORT[action];
    if (s.consequential) {
      consequentialTotal += 1;
      if (action === "migrate") {
        creditSum += 1;
        cleanCorrect += 1;
      } else {
        missedConsequential += 1;
      }
      // migrate is the correct (and only) clean-out, so no over-effort is possible.
    } else {
      // A tolerable mismatch: leaving it is correct; migrating it burns effort.
      wasted += eff;
      if (eff > 0) overCleaned += 1;
      maxWaste += MAX_SOURCE_EFFORT;
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

/** Nominal human minutes a record clean-up costs, for the effort read. */
const RECORD_MINUTES: Record<RecordAction, number> = { keep: 0, drop: 1, fix: 5 };

export interface ImpactRecord {
  id: string;
  consequential: boolean;
  correctAction: RecordAction;
}
export interface ImpactSource {
  id: string;
  consequential: boolean;
  correctAction: SourceAction;
  /** Hours it takes to migrate this source — shown to the player. */
  migrationEffort: number;
}

export interface CleanThePipeImpact {
  /** Output quality if the step were run on the raw data, untouched. */
  rawQuality: QualityBand;
  /** Output quality from the player's triaged + migrated data. */
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
  records: ImpactRecord[],
  sources: ImpactSource[],
  recordActions: Record<string, RecordAction>,
  sourceActions: Record<string, SourceAction>,
): CleanThePipeImpact {
  let consequentialTotal = 0;
  let consequentialAddressed = 0;
  let anyDegraded = false;
  let gateTripped = false;
  let effortMinutes = 0;
  let idealMinutes = 0;

  for (const r of records) {
    const action = recordActions[r.id] ?? "keep";
    effortMinutes += RECORD_MINUTES[action];
    if (r.consequential) {
      consequentialTotal += 1;
      idealMinutes += RECORD_MINUTES[r.correctAction];
      if (action === "keep") gateTripped = true;
      else {
        consequentialAddressed += 1;
        if (action !== r.correctAction) anyDegraded = true;
      }
    }
  }

  let effortHours = effortMinutes / 60;
  let idealHours = idealMinutes / 60;

  for (const s of sources) {
    const action = sourceActions[s.id] ?? "leave";
    if (action === "migrate") effortHours += s.migrationEffort;
    if (s.consequential) {
      consequentialTotal += 1;
      idealHours += s.migrationEffort;
      if (action === "migrate") consequentialAddressed += 1;
      else gateTripped = true;
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
      "The output holds up, though you discarded data you could have repaired — cheaper isn't always better.";
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
