import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { generateHallucinationRound } from "@/lib/ai/hallucination";
import { db } from "@/lib/db/client";
import { challenges, hallucinationRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

/**
 * Generate a fresh "Spot the Hallucination" round. The full scenario (with the
 * ground-truth `hallucination` flags) is persisted server-side; the response
 * strips those flags so the client never knows the answers up front.
 *
 * Body: { challengeId: string, difficulty?: number }
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
  // different theme (no two "survey results" rounds back to back).
  const avoidTopics: string[] = Array.isArray(body?.avoidTopics)
    ? body.avoidTopics.filter((t: unknown): t is string => typeof t === "string")
    : [];

  const player = await getOrCreatePlayer();
  const scenario = await generateHallucinationRound(difficulty, { avoidTopics });

  const roundId = randomUUID();
  db.insert(hallucinationRounds)
    .values({
      id: roundId,
      playerId: player.id,
      challengeId: challenge.id,
      difficulty,
      scenario: scenario as unknown as Record<string, unknown>,
      createdAt: new Date(),
    })
    .run();

  // Strip ground-truth flags before sending to the client.
  const safeScenario = {
    ...scenario,
    claims: scenario.claims.map((c) => ({ id: c.id, text: c.text })),
  };

  return NextResponse.json({
    roundId,
    difficulty,
    topic: scenario.topic,
    scenario: safeScenario,
  });
}
