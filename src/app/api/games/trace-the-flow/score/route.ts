import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  generateTraceFlowOutcome,
  type TraceFlowScenario,
} from "@/lib/ai/trace-flow";
import { db } from "@/lib/db/client";
import { attempts, challenges, players, traceFlowRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import {
  gradeTrace,
  type HandoffPair,
  type TraceTruth,
} from "@/lib/trace-flow-scoring";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

/**
 * Score a "Trace the Flow" round. Grading is fully server-side against the stored
 * canonical order and hand-off truth, on two axes (see docs/GAME-RULES.md):
 *
 *   sequence  = correctlyPlaced / total                 (the gate)
 *   diagnosis = correctJudgments / totalJudgments        (broken links + shape)
 *   scoreRatio = 0.5 * sequence + 0.5 * diagnosis  (capped at 0.5 if mis-sequenced)
 *
 * The reconstructed flow is then narrated once so the scorecard can show what it
 * produced — illustrative only; it never affects the score.
 *
 * Body: {
 *   roundId, orderedIds: string[],
 *   brokenPairs: {fromId,toId}[],
 *   parallelIds?: string[],
 *   loopBack?: {fromId,toId} | null
 * }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;

  const orderedIds: string[] = Array.isArray(body?.orderedIds)
    ? body.orderedIds.filter((t: unknown): t is string => typeof t === "string")
    : [];
  const brokenPairs: HandoffPair[] = Array.isArray(body?.brokenPairs)
    ? body.brokenPairs
        .filter(
          (p: unknown): p is { fromId: unknown; toId: unknown } =>
            typeof p === "object" && p !== null,
        )
        .filter(
          (p: { fromId: unknown; toId: unknown }) =>
            typeof p.fromId === "string" && typeof p.toId === "string",
        )
        .map((p: { fromId: string; toId: string }) => ({
          fromId: p.fromId,
          toId: p.toId,
        }))
    : [];
  const parallelIds: string[] = Array.isArray(body?.parallelIds)
    ? body.parallelIds.filter((t: unknown): t is string => typeof t === "string")
    : [];
  const loopBack: HandoffPair | null =
    body?.loopBack &&
    typeof body.loopBack === "object" &&
    typeof body.loopBack.fromId === "string" &&
    typeof body.loopBack.toId === "string"
      ? { fromId: body.loopBack.fromId, toId: body.loopBack.toId }
      : null;

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = db
    .select()
    .from(traceFlowRounds)
    .where(eq(traceFlowRounds.id, roundId))
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

  const scenario = round.scenario as unknown as TraceFlowScenario;

  const truth: TraceTruth = {
    steps: scenario.steps.map((s) => ({
      id: s.id,
      position: s.position,
      parallelGroup: s.parallelGroup ?? null,
    })),
    brokenHandoffs: scenario.brokenHandoffs.map((b) => ({
      fromId: b.fromId,
      toId: b.toId,
    })),
    loopBack: scenario.loopBack
      ? { fromId: scenario.loopBack.fromId, toId: scenario.loopBack.toId }
      : null,
  };

  const graded = gradeTrace(truth, {
    orderedIds,
    brokenPairs,
    parallelIds,
    loopBack,
  });
  const score = Math.round(graded.scoreRatio * challenge.maxScore);
  const xpEarned = Math.round(challenge.xpReward * graded.scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, graded.scoreRatio);

  const output = await generateTraceFlowOutcome({ scenario, graded });

  // Reveal the true chain for the debrief: every step in canonical order, with
  // whether the player placed it correctly and where they put it.
  const placedIndex = new Map<string, number>();
  orderedIds.forEach((id, i) => placedIndex.set(id, i));
  const gradedById = new Map(graded.steps.map((s) => [s.id, s]));
  const steps = [...scenario.steps]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      title: s.title,
      detail: s.detail,
      input: s.input,
      output: s.output,
      position: s.position,
      parallelGroup: s.parallelGroup ?? null,
      placedIndex: placedIndex.has(s.id)
        ? (placedIndex.get(s.id) as number)
        : -1,
      correct: gradedById.get(s.id)?.correct ?? false,
    }));

  // Reveal each broken hand-off and whether the player caught it.
  const flaggedSet = new Set(brokenPairs.map((p) => `${p.fromId}>${p.toId}`));
  const brokenHandoffs = scenario.brokenHandoffs.map((b) => ({
    fromId: b.fromId,
    toId: b.toId,
    reason: b.reason,
    caught: flaggedSet.has(`${b.fromId}>${b.toId}`),
  }));

  const loopBackResult = scenario.loopBack
    ? {
        fromId: scenario.loopBack.fromId,
        toId: scenario.loopBack.toId,
        reason: scenario.loopBack.reason,
        correct: graded.loopBackCorrect,
      }
    : null;
  const parallelResult = graded.hasParallel
    ? {
        ids: scenario.steps
          .filter((s) => s.parallelGroup)
          .map((s) => s.id),
        correct: graded.parallelCorrect,
      }
    : null;

  const feedback = `${graded.correctlyPlaced}/${graded.total} steps in order · ${graded.brokenCaught}/${graded.brokenTotal} broken hand-off${graded.brokenTotal === 1 ? "" : "s"} caught · ${graded.falseFlags} false flag${graded.falseFlags === 1 ? "" : "s"}.`;

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({
        roundId,
        orderedIds,
        brokenPairs,
        parallelIds,
        loopBack,
        output,
      }),
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
    sequence: Math.round(graded.sequence * 100),
    diagnosis: Math.round(graded.diagnosis * 100),
    correctlyPlaced: graded.correctlyPlaced,
    total: graded.total,
    brokenTotal: graded.brokenTotal,
    brokenCaught: graded.brokenCaught,
    falseFlags: graded.falseFlags,
    steps,
    brokenHandoffs,
    loopBack: loopBackResult,
    parallel: parallelResult,
    shape: scenario.shape,
    shapeTier: scenario.shapeTier,
    workflowName: scenario.workflowName,
    goal: scenario.goal,
    output,
    explanation: scenario.explanation,
    xpEarned,
    bonusXp,
    exceptional: graded.exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
