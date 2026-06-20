import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { generateCheckpointPlacementRound } from "@/lib/ai/checkpoint-placement";
import { db } from "@/lib/db/client";
import { challenges, checkpointPlacementRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

/**
 * Generate a fresh "In the Loop" (Checkpoint Placement) round. The full scenario
 * — including each workflow step's `kind` — is persisted server-side; the
 * response strips that ground truth so the client never learns which steps are
 * critical, safe or traps before scoring.
 *
 * Body: { challengeId: string, difficulty?: number, avoidTopics?: string[] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const challengeId = body?.challengeId as string | undefined;

  if (!challengeId) {
    return NextResponse.json(
      { error: "challengeId is required" },
      { status: 400 },
    );
  }

  const challenge = db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .get();
  if (!challenge) {
    return NextResponse.json({ error: "Unknown challenge" }, { status: 404 });
  }

  // Difficulty comes from the challenge config (Round 1..5); allow an override.
  const configDifficulty = Number(
    (challenge.config as { difficulty?: number } | null)?.difficulty ?? 1,
  );
  const difficulty = Number(body?.difficulty ?? configDifficulty) || 1;

  // Topics already used earlier in this play-through, so the round picks a
  // distinct theme.
  const avoidTopics: string[] = Array.isArray(body?.avoidTopics)
    ? body.avoidTopics.filter((t: unknown): t is string => typeof t === "string")
    : [];

  const player = await getOrCreatePlayer();
  const scenario = await generateCheckpointPlacementRound(difficulty, {
    avoidTopics,
  });

  const roundId = randomUUID();
  db.insert(checkpointPlacementRounds)
    .values({
      id: roundId,
      playerId: player.id,
      challengeId: challenge.id,
      difficulty,
      scenario: scenario as unknown as Record<string, unknown>,
      createdAt: new Date(),
    })
    .run();

  // Strip the ground truth — each step's `kind` — before sending to the client.
  // The player sees the workflow and decides where a checkpoint belongs.
  const safeScenario = {
    topic: scenario.topic,
    riskTier: scenario.riskTier,
    workflowName: scenario.workflowName,
    brief: scenario.brief,
    goal: scenario.goal,
    steps: scenario.steps.map((s) => ({
      id: s.id,
      title: s.title,
      detail: s.detail,
      impact: s.impact,
    })),
  };

  return NextResponse.json({
    roundId,
    difficulty,
    topic: scenario.topic,
    scenario: safeScenario,
  });
}
