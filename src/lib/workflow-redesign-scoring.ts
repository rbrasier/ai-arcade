/**
 * Pure, dependency-free scoring helpers for the "Workflow Redesign Challenge"
 * (Act Four — the capstone). Imports nothing from the AI connector or the server
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
