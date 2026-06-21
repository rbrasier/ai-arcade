import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  generateValidationCritique,
  type WorkflowRedesignScenario,
} from "@/lib/ai/workflow-redesign";
import { db } from "@/lib/db/client";
import {
  attempts,
  challenges,
  players,
  workflowRedesignRounds,
} from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import {
  gradeRedesign,
  type CapabilityKind,
  type ImplTier,
  type StageBuild,
} from "@/lib/workflow-redesign-scoring";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

const CAPS = ["summarise", "classify", "extract", "flag", "draft"];
const IMPLS = ["rules", "llm", "custom-app"];

/** Coerce one untrusted build entry into a clean StageBuild. */
function parseBuild(raw: unknown): StageBuild | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.stageId !== "string") return null;
  const capability =
    typeof r.capability === "string" && CAPS.includes(r.capability)
      ? (r.capability as CapabilityKind)
      : null;
  const impl =
    typeof r.impl === "string" && IMPLS.includes(r.impl)
      ? (r.impl as ImplTier)
      : null;
  return { stageId: r.stageId, capability, impl, checkpoint: Boolean(r.checkpoint) };
}

/**
 * Score a "Workflow Redesign Challenge" round (Act Four capstone). Grading is
 * fully server-side against the stored stage ground truth, on three axes (see
 * docs/GAME-RULES.md):
 *
 *   redesign      = capability fit per bottleneck          (gate: all addressed)
 *   governance    = checkpoint coverage + efficiency       (gate: all criticals)
 *   buildJudgment = implementation-tier fit
 *   scoreRatio = 0.45*redesign + 0.30*governance + 0.25*buildJudgment
 *              (capped at 0.5 if either gate fails)
 *
 * The design is then critiqued by the AI on technical + governance dimensions —
 * illustrative narration only; it never affects the deterministic score.
 *
 * Body: { roundId: string, builds: StageBuild[] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const builds: StageBuild[] = Array.isArray(body?.builds)
    ? body.builds.map(parseBuild).filter((b: StageBuild | null): b is StageBuild => b !== null)
    : [];

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = db
    .select()
    .from(workflowRedesignRounds)
    .where(eq(workflowRedesignRounds.id, roundId))
    .get();
  if (!round) {
    return NextResponse.json({ error: "Unknown round" }, { status: 404 });
  }

  const player = await getOrCreatePlayer();
  if (round.playerId !== player.id) {
    return NextResponse.json({ error: "Not your round" }, { status: 403 });
  }

  const challenge = db
    .select()
    .from(challenges)
    .where(eq(challenges.id, round.challengeId))
    .get();
  if (!challenge) {
    return NextResponse.json({ error: "Unknown challenge" }, { status: 404 });
  }

  const scenario = round.scenario as unknown as WorkflowRedesignScenario;

  const graded = gradeRedesign(scenario.stages, builds);
  const score = Math.round(graded.scoreRatio * challenge.maxScore);
  const xpEarned = Math.round(challenge.xpReward * graded.scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, graded.scoreRatio);

  // AI critique of the finished design — illustrative, never affects the score.
  const critique = await generateValidationCritique({ scenario, builds });

  // Per-stage breakdown for the debrief: ground truth + the player's choice.
  const byId = new Map(builds.map((b) => [b.stageId, b]));
  const stages = scenario.stages.map((s) => {
    const b = byId.get(s.id);
    const capabilityOk = Boolean(
      b?.capability && s.acceptableCapabilities.includes(b.capability),
    );
    const implOk = Boolean(b?.impl && s.acceptableImpls.includes(b.impl));
    return {
      id: s.id,
      name: s.name,
      painPoint: s.painPoint,
      timeCost: s.timeCost,
      rationale: s.rationale,
      bestCapability: s.bestCapability,
      bestImpl: s.bestImpl,
      checkpointKind: s.checkpointKind,
      chosenCapability: b?.capability ?? null,
      chosenImpl: b?.impl ?? null,
      checkpointed: Boolean(b?.checkpoint),
      capabilityOk,
      implOk,
    };
  });

  const feedback = `${graded.stagesAddressed}/${graded.stagesTotal} bottlenecks addressed · ${graded.criticalCheckpointed}/${graded.criticalTotal} critical checkpoints · ${graded.overCheckpointed} needless.`;

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ roundId, builds, critique }),
      evaluation: {
        score,
        feedback,
        exceptional: graded.exceptional,
      },
      createdAt: new Date(),
    })
    .run();

  const newXp = player.xp + xpEarned + bonusXp;
  const newLevel = levelForXp(newXp);
  db.update(players)
    .set({ xp: newXp, level: newLevel })
    .where(eq(players.id, player.id))
    .run();

  return NextResponse.json({
    score,
    maxScore: challenge.maxScore,
    redesign: Math.round(graded.redesign * 100),
    governance: Math.round(graded.governance * 100),
    buildJudgment: Math.round(graded.buildJudgment * 100),
    coverage: Math.round(graded.coverage * 100),
    efficiency: Math.round(graded.efficiency * 100),
    stagesAddressed: graded.stagesAddressed,
    stagesTotal: graded.stagesTotal,
    allAddressed: graded.allAddressed,
    criticalTotal: graded.criticalTotal,
    criticalCheckpointed: graded.criticalCheckpointed,
    overCheckpointed: graded.overCheckpointed,
    gatePassed: graded.gatePassed,
    stages,
    workflowName: scenario.workflowName,
    goal: scenario.goal,
    critique,
    explanation: scenario.explanation,
    xpEarned,
    bonusXp,
    exceptional: graded.exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
