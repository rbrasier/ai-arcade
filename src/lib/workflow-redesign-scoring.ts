/**
 * Pure, dependency-free scoring helpers for the "Workflow Redesign Challenge"
 * (Act Five — the capstone). Imports nothing from the AI connector or the server
 * runtime so it can be shared by the scoring route and (where useful) the client.
 *
 * The capstone integrates the whole arc, so it grades the player's redesigned
 * pipeline on THREE deterministic axes against the stored ground truth of every
 * workflow stage (see docs/GAME-RULES.md). Each axis owns one decision the player
 * makes per stage:
 *
 *   redesign      = how well each bottleneck was matched to an AI capability
 *                   (summarise/classify/extract/flag/draft)        — the GATE
 *   governance    = human-review checkpoints placed where decisions are
 *                   irreversible/affect a person, and nowhere needless — symmetric
 *   buildJudgment = the implementation tier chosen (rules / LLM / custom-app):
 *                   the "appropriate use of custom build options" skill
 *
 *   scoreRatio = 0.45*redesign + 0.30*governance + 0.25*buildJudgment
 *
 * Two gates, inherited from the two Act-spanning games this capstone unifies:
 *  - like Context Calibration, every bottleneck must get an adequate capability;
 *  - like In the Loop, every governance-critical stage must be checkpointed.
 * Miss either and the round is capped at GATE_CAP (0.5) — below the 65% clear.
 *
 * Worked outcomes:
 *  - perfect redesign (best capability + best impl everywhere, checkpoints exactly
 *    right)                                                  → 1.0 (exceptional)
 *  - every bottleneck addressed with the best capability, impls merely acceptable,
 *    criticals guarded + one needless checkpoint             → ~0.82 (clears, bonus)
 *  - under-powered impls, criticals guarded but over-checkpointed everything else
 *                                                            → ~0.60 (fails)
 *  - a bottleneck left unaddressed OR a critical left unguarded → capped 0.5 (fails)
 */

/** The AI capability a player can assign to a workflow stage. */
export type CapabilityKind =
  | "summarise"
  | "classify"
  | "extract"
  | "flag"
  | "draft";

/** How the capability is implemented — the "art of the possible" axis. */
export type ImplTier = "rules" | "llm" | "custom-app";

/** Ground-truth governance label every stage carries (never sent pre-scoring). */
export type CheckpointKind = "critical" | "trap" | "safe" | "optional";

export const REDESIGN_WEIGHT = 0.45;
export const GOVERNANCE_WEIGHT = 0.3;
export const BUILD_WEIGHT = 0.25;

/** Capability credit: matching the best block beats a merely-acceptable one. */
export const CAP_BEST = 1;
export const CAP_ACCEPTABLE = 0.7;
/** Implementation credit: the best tier beats an acceptable-but-not-ideal one. */
export const IMPL_BEST = 1;
export const IMPL_ACCEPTABLE = 0.5;

/** Governance is symmetric (mirrors In the Loop): coverage gate + efficiency. */
export const GOV_COVERAGE_WEIGHT = 0.5;
export const GOV_EFFICIENCY_WEIGHT = 0.5;
/** A needless checkpoint on a tempting-but-safe stage costs twice a plainly-safe one. */
export const SAFE_WEIGHT = 1;
export const TRAP_WEIGHT = 2;

/** Failing either gate caps the round here — below the 65% clear. */
export const GATE_CAP = 0.5;

/** Ground truth for one current-state stage of the workflow. */
export interface StageGroundTruth {
  id: string;
  /** Human minutes this stage takes today, per item — the numeric behind `timeCost`. */
  manualMinutes: number;
  /** Capabilities that genuinely address this stage's bottleneck. */
  bestCapability: CapabilityKind;
  acceptableCapabilities: CapabilityKind[];
  /** Implementation tiers: the ideal one, and any that are reasonable. */
  bestImpl: ImplTier;
  acceptableImpls: ImplTier[];
  /** Whether this stage needs a human checkpoint (and the temptation traps). */
  checkpointKind: CheckpointKind;
}

/** One stage of the player's redesigned pipeline. */
export interface StageBuild {
  stageId: string;
  capability: CapabilityKind | null;
  impl: ImplTier | null;
  checkpoint: boolean;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export interface GradedRedesign {
  redesign: number;
  governance: number;
  buildJudgment: number;
  coverage: number;
  efficiency: number;
  scoreRatio: number;
  exceptional: boolean;
  /** Gate diagnostics for the debrief. */
  stagesTotal: number;
  stagesAddressed: number;
  allAddressed: boolean;
  criticalTotal: number;
  criticalCheckpointed: number;
  overCheckpointed: number;
  gatePassed: boolean;
}

/**
 * Grade a redesigned pipeline against the stored stage ground truth. Pure: the
 * route is the only caller today, but keeping it dependency-free matches the
 * other games and lets a client preview reuse it if ever needed.
 */
export function gradeRedesign(
  stages: StageGroundTruth[],
  builds: StageBuild[],
): GradedRedesign {
  const byId = new Map(builds.map((b) => [b.stageId, b]));

  let capCredit = 0;
  let implCredit = 0;
  let stagesAddressed = 0;

  let criticalTotal = 0;
  let criticalCheckpointed = 0;
  let trapTotal = 0;
  let trapCheckpointed = 0;
  let safeTotal = 0;
  let safeCheckpointed = 0;

  for (const stage of stages) {
    const build = byId.get(stage.id);

    // ---- redesign: did this bottleneck get an adequate capability? ----
    if (build?.capability === stage.bestCapability) {
      capCredit += CAP_BEST;
      stagesAddressed += 1;
    } else if (
      build?.capability &&
      stage.acceptableCapabilities.includes(build.capability)
    ) {
      capCredit += CAP_ACCEPTABLE;
      stagesAddressed += 1;
    }

    // ---- buildJudgment: was the implementation tier appropriate? ----
    if (build?.impl === stage.bestImpl) {
      implCredit += IMPL_BEST;
    } else if (build?.impl && stage.acceptableImpls.includes(build.impl)) {
      implCredit += IMPL_ACCEPTABLE;
    }

    // ---- governance: checkpoint placement ----
    const guarded = Boolean(build?.checkpoint);
    switch (stage.checkpointKind) {
      case "critical":
        criticalTotal += 1;
        if (guarded) criticalCheckpointed += 1;
        break;
      case "trap":
        trapTotal += 1;
        if (guarded) trapCheckpointed += 1;
        break;
      case "safe":
        safeTotal += 1;
        if (guarded) safeCheckpointed += 1;
        break;
      // "optional" is neutral — a checkpoint there neither gates nor penalises.
    }
  }

  const stagesTotal = stages.length;
  const redesign = stagesTotal > 0 ? capCredit / stagesTotal : 1;
  const buildJudgment = stagesTotal > 0 ? implCredit / stagesTotal : 1;

  const coverage = criticalTotal > 0 ? criticalCheckpointed / criticalTotal : 1;
  const overWeighted =
    trapCheckpointed * TRAP_WEIGHT + safeCheckpointed * SAFE_WEIGHT;
  const overTotalWeighted = trapTotal * TRAP_WEIGHT + safeTotal * SAFE_WEIGHT;
  const efficiency =
    overTotalWeighted > 0 ? Math.max(0, 1 - overWeighted / overTotalWeighted) : 1;
  const governance =
    GOV_COVERAGE_WEIGHT * coverage + GOV_EFFICIENCY_WEIGHT * efficiency;

  const allAddressed = stagesAddressed >= stagesTotal;
  const gatePassed = allAddressed && coverage >= 1;

  const raw =
    REDESIGN_WEIGHT * redesign +
    GOVERNANCE_WEIGHT * governance +
    BUILD_WEIGHT * buildJudgment;
  const scoreRatio = gatePassed ? clamp01(raw) : Math.min(raw, GATE_CAP);

  const exceptional =
    redesign >= 1 && buildJudgment >= 1 && coverage >= 1 && efficiency >= 1;

  return {
    redesign,
    governance,
    buildJudgment,
    coverage,
    efficiency,
    scoreRatio,
    exceptional,
    stagesTotal,
    stagesAddressed,
    allAddressed,
    criticalTotal,
    criticalCheckpointed,
    overCheckpointed: trapCheckpointed + safeCheckpointed,
    gatePassed,
  };
}

/* ============================================================================
 * Consequences: deterministic speed + quality read on the redesign.
 *
 * This is FEEDBACK ONLY — it never touches the score (see docs/GAME-RULES.md).
 * Its job is to make the player FEEL what their capability / implementation /
 * checkpoint choices did to the workflow: how much faster it now runs, and where
 * a choice introduced a production risk (errors, unguarded AI judgement, or an
 * over-built / over-reviewed step that quietly gives the speed back).
 * ==========================================================================*/

/** Fraction of the manual time an automated step takes, by implementation tier. */
export const IMPL_SPEED_FACTOR: Record<ImplTier, number> = {
  rules: 0.05, // near-instant deterministic check
  llm: 0.12, // a model call — fast, a touch slower than a rule
  "custom-app": 0.04, // purpose-built and integrated: the fastest at runtime
};
/** An automated step never drops below this many minutes. */
export const AUTOMATION_FLOOR_MIN = 0.5;
/** A human checkpoint adds review time back: this fraction of the manual time… */
export const CHECKPOINT_REVIEW_FRACTION = 0.25;
/** …but never less than this many minutes. */
export const CHECKPOINT_REVIEW_MIN = 2;

/** Plain-language quality read on a single stage's build choice. */
export type QualityBand =
  | "sound"
  | "unaddressed"
  | "under-powered"
  | "hallucination-exposed"
  | "over-built";

/**
 * Per-item minutes the stage takes AFTER the redesign, given the player's build.
 * Pure and ground-truth-free, so the client can show a live estimate while the
 * player is still building (it leaks no answers — only time).
 */
export function redesignedStageMinutes(
  manualMinutes: number,
  build: Pick<StageBuild, "capability" | "impl" | "checkpoint"> | undefined,
): number {
  // No capability assigned → the stage is still done by hand.
  if (!build?.capability) return manualMinutes;
  const factor = build.impl ? IMPL_SPEED_FACTOR[build.impl] : IMPL_SPEED_FACTOR.llm;
  let minutes = Math.max(AUTOMATION_FLOOR_MIN, manualMinutes * factor);
  // A human checkpoint adds review time back — the cost of (over-)gating.
  if (build.checkpoint) {
    minutes += Math.max(CHECKPOINT_REVIEW_MIN, manualMinutes * CHECKPOINT_REVIEW_FRACTION);
  }
  return minutes;
}

export interface SpeedSummary {
  /** Per-item minutes the workflow takes today, by hand. */
  beforeMinutes: number;
  /** Per-item minutes the redesign takes. */
  afterMinutes: number;
  /** Share of the cycle time removed, 0..1 (can be ~0 if everything is gated). */
  pctFaster: number;
}

/**
 * Speed-only summary: shareable with the client for a live "estimated cycle time"
 * readout during the Build phase (uses only `manualMinutes`, never ground truth).
 */
export function computeSpeed(
  stages: { id: string; manualMinutes: number }[],
  builds: StageBuild[],
): SpeedSummary {
  const byId = new Map(builds.map((b) => [b.stageId, b]));
  let beforeMinutes = 0;
  let afterMinutes = 0;
  for (const s of stages) {
    beforeMinutes += s.manualMinutes;
    afterMinutes += redesignedStageMinutes(s.manualMinutes, byId.get(s.id));
  }
  const pctFaster =
    beforeMinutes > 0 ? Math.max(0, (beforeMinutes - afterMinutes) / beforeMinutes) : 0;
  return { beforeMinutes, afterMinutes, pctFaster };
}

export interface StageImpact {
  id: string;
  band: QualityBand;
  manualMinutes: number;
  afterMinutes: number;
}

export interface WorkflowImpact extends SpeedSummary {
  /** Items processed per month — the volume the time saving is multiplied over. */
  volumePerMonth: number;
  /** Whole hours of human time saved per month at that volume. */
  hoursSavedPerMonth: number;
  /** Per-stage quality read. */
  stages: StageImpact[];
  /** Counts of stages in each quality band. */
  counts: Record<QualityBand, number>;
  /** Needless checkpoints on safe/trap stages — over-review drag. */
  overReviewed: number;
  /** One-line qualitative verdict on the redesign's production readiness. */
  verdict: string;
}

/** Classify one stage's build into a plain-language quality band vs ground truth. */
function qualityBand(stage: StageGroundTruth, build: StageBuild | undefined): QualityBand {
  const capOk = Boolean(
    build?.capability && stage.acceptableCapabilities.includes(build.capability),
  );
  if (!capOk) return "unaddressed";

  // An unguarded LLM owning an irreversible/person-affecting call: a hallucination
  // can reach the outside world with no one checking it.
  if (build?.impl === "llm" && stage.checkpointKind === "critical" && !build.checkpoint) {
    return "hallucination-exposed";
  }

  const implOk = Boolean(build?.impl && stage.acceptableImpls.includes(build.impl));
  if (!implOk && build?.impl) {
    if (build.impl === "custom-app" && stage.bestImpl !== "custom-app") return "over-built";
    return "under-powered"; // rules (or an off LLM) where more capability was needed
  }
  return "sound";
}

/**
 * Full consequences read: speed + per-stage quality + a one-line verdict. Pure,
 * server-side (it needs the stored ground truth). `volumePerMonth` scales the
 * time saving into a tangible monthly figure.
 */
export function computeWorkflowImpact(
  stages: StageGroundTruth[],
  builds: StageBuild[],
  volumePerMonth: number,
): WorkflowImpact {
  const byId = new Map(builds.map((b) => [b.stageId, b]));
  const speed = computeSpeed(stages, builds);

  const counts: Record<QualityBand, number> = {
    sound: 0,
    unaddressed: 0,
    "under-powered": 0,
    "hallucination-exposed": 0,
    "over-built": 0,
  };
  let overReviewed = 0;
  const stageImpacts: StageImpact[] = stages.map((s) => {
    const build = byId.get(s.id);
    const band = qualityBand(s, build);
    counts[band] += 1;
    if (
      build?.checkpoint &&
      (s.checkpointKind === "safe" || s.checkpointKind === "trap")
    ) {
      overReviewed += 1;
    }
    return {
      id: s.id,
      band,
      manualMinutes: s.manualMinutes,
      afterMinutes: redesignedStageMinutes(s.manualMinutes, build),
    };
  });

  const minutesSavedPerMonth =
    Math.max(0, speed.beforeMinutes - speed.afterMinutes) * volumePerMonth;
  const hoursSavedPerMonth = Math.round(minutesSavedPerMonth / 60);

  let verdict: string;
  if (counts.unaddressed > 0) {
    verdict = "Incomplete — a bottleneck is still done by hand";
  } else if (counts["hallucination-exposed"] > 0) {
    verdict = "Fast but risky — AI judgement reaches the outside world unchecked";
  } else if (counts["under-powered"] > 0) {
    verdict = "Fast but error-prone — a step is under-powered for its nuance";
  } else if (counts["over-built"] > 0) {
    verdict = "Sound but over-built — a step costs more to run than it needs to";
  } else if (overReviewed >= 2 || speed.pctFaster < 0.5) {
    verdict = "Safe but heavy — over-reviewing gives much of the speed back";
  } else {
    verdict = "Production-ready — fast where it can be, guarded where it must be";
  }

  return {
    ...speed,
    volumePerMonth,
    hoursSavedPerMonth,
    stages: stageImpacts,
    counts,
    overReviewed,
    verdict,
  };
}
