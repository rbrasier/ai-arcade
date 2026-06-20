import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  generateCheckpointPlacementOutcome,
  type CheckpointPlacementScenario,
} from "@/lib/ai/checkpoint-placement";
import { db } from "@/lib/db/client";
import {
  attempts,
  challenges,
  checkpointPlacementRounds,
  players,
} from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import { gradeCheckpoints } from "@/lib/checkpoint-placement-scoring";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

/**
 * Score an "In the Loop" (Checkpoint Placement) round. Grading is fully
 * server-side against the stored step kinds, on two symmetric axes (see
 * docs/GAME-RULES.md):
 *
 *   coverage   = criticalCheckpointed / criticalTotal   (the gate)
 *   efficiency = 1 - weightedOverCheckpointed / weightedSafeTotal  (traps weigh 2×)
 *   scoreRatio = 0.5 * coverage + 0.5 * efficiency  (capped at 0.5 if a critical is unguarded)
 *
 * The workflow is then simulated once with the player's checkpoints in place so
 * the scorecard can show what their oversight design produced — illustrative
 * only; it never affects the score.
 *
 * Body: { roundId: string, checkpointedIds: string[] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const checkpointedIds: string[] = Array.isArray(body?.checkpointedIds)
    ? body.checkpointedIds.filter((t: unknown): t is string => typeof t === "string")
    : [];

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = db
    .select()
    .from(checkpointPlacementRounds)
    .where(eq(checkpointPlacementRounds.id, roundId))
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

  const scenario = round.scenario as unknown as CheckpointPlacementScenario;

  const graded = gradeCheckpoints(scenario.steps, checkpointedIds);
  const score = Math.round(graded.scoreRatio * challenge.maxScore);
  const xpEarned = Math.round(challenge.xpReward * graded.scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, graded.scoreRatio);

  // Run the workflow once to show what the player's oversight design produced.
  const output = await generateCheckpointPlacementOutcome({
    scenario,
    checkpointedIds,
  });

  // Per-step breakdown for the debrief: the kind, and whether it was guarded.
  const checkpointed = new Set(checkpointedIds);
  const steps = scenario.steps.map((s) => ({
    id: s.id,
    title: s.title,
    detail: s.detail,
    impact: s.impact,
    kind: s.kind,
    checkpointed: checkpointed.has(s.id),
  }));

  const missedCritical = graded.criticalCheckpointed < graded.criticalTotal;
  const overChecked = graded.safeCheckpointed + graded.trapCheckpointed;
  const feedback = `${graded.criticalCheckpointed}/${graded.criticalTotal} critical steps guarded · ${overChecked} needless checkpoint${overChecked === 1 ? "" : "s"}.`;

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ roundId, checkpointedIds, output }),
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
    coverage: Math.round(graded.coverage * 100),
    efficiency: Math.round(graded.efficiency * 100),
    criticalTotal: graded.criticalTotal,
    criticalCheckpointed: graded.criticalCheckpointed,
    overChecked,
    missedCritical,
    steps,
    workflowName: scenario.workflowName,
    goal: scenario.goal,
    riskTier: scenario.riskTier,
    output,
    explanation: scenario.explanation,
    xpEarned,
    bonusXp,
    exceptional: graded.exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
