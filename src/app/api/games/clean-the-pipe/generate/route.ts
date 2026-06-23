import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { generateCleanThePipeRound } from "@/lib/ai/clean-the-pipe";
import { db } from "@/lib/db/client";
import { challenges, cleanThePipeRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

/**
 * Generate a fresh "Clean the Pipe" round. The full scenario — including each
 * record's and source's `consequential` flag, `correctAction` and `reason` — is
 * persisted server-side; the response strips that ground truth so the client
 * never learns which items matter (or the right call) before scoring.
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
  const scenario = await generateCleanThePipeRound(difficulty, { avoidTopics });

  const roundId = randomUUID();
  db.insert(cleanThePipeRounds)
    .values({
      id: roundId,
      playerId: player.id,
      challengeId: challenge.id,
      difficulty,
      scenario: scenario as unknown as Record<string, unknown>,
      createdAt: new Date(),
    })
    .run();

  // Strip the ground truth — `consequential`, `correctAction`, `reason` — before
  // sending to the client. The player sees only the data and decides what to do.
  const safeScenario = {
    topic: scenario.topic,
    difficulty: scenario.difficulty,
    stepName: scenario.stepName,
    datasetName: scenario.datasetName,
    brief: scenario.brief,
    goal: scenario.goal,
    records: scenario.records.map((r) => ({
      id: r.id,
      label: r.label,
      content: r.content,
    })),
    sources: scenario.sources.map((s) => ({
      id: s.id,
      name: s.name,
      mismatch: s.mismatch,
      migrationEffort: s.migrationEffort,
    })),
  };

  return NextResponse.json({
    roundId,
    difficulty,
    topic: scenario.topic,
    scenario: safeScenario,
  });
}
