import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { generateRightToolRound } from "@/lib/ai/right-tool-for-the-job";
import { db } from "@/lib/db/client";
import { challenges, rightToolRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

/**
 * Generate a fresh "Fit for Purpose" (Right Tool for the Job) round. The full
 * scenario — including each intervention's hidden cost params — is persisted
 * server-side; the response strips those so the client never learns which option
 * is cheapest before scoring. The step's characteristics ARE sent: reasoning from
 * them is the whole point of the game.
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

  const configDifficulty = Number(
    (challenge.config as { difficulty?: number } | null)?.difficulty ?? 1,
  );
  const difficulty = Number(body?.difficulty ?? configDifficulty) || 1;

  const avoidTopics: string[] = Array.isArray(body?.avoidTopics)
    ? body.avoidTopics.filter((t: unknown): t is string => typeof t === "string")
    : [];

  const player = await getOrCreatePlayer();
  const scenario = await generateRightToolRound(difficulty, { avoidTopics });

  const roundId = randomUUID();
  db.insert(rightToolRounds)
    .values({
      id: roundId,
      playerId: player.id,
      challengeId: challenge.id,
      difficulty,
      scenario: scenario as unknown as Record<string, unknown>,
      createdAt: new Date(),
    })
    .run();

  // Strip the ground truth — the per-option cost params — before sending to the
  // client. The player sees the step and its characteristics and picks a tool.
  const safeScenario = {
    topic: scenario.topic,
    tier: scenario.tier,
    brief: scenario.brief,
    goal: scenario.goal,
    stepTitle: scenario.stepTitle,
    stepDetail: scenario.stepDetail,
    characteristics: scenario.characteristics,
  };

  return NextResponse.json({
    roundId,
    difficulty,
    topic: scenario.topic,
    scenario: safeScenario,
  });
}
