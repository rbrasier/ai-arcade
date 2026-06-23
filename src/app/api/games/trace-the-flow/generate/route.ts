import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { generateTraceFlowRound } from "@/lib/ai/trace-flow";
import { db } from "@/lib/db/client";
import { challenges, traceFlowRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

/**
 * Generate a fresh "Trace the Flow" round. The full scenario — each step's
 * canonical `position`, any `parallelGroup`, the broken hand-offs and the
 * loop-back — is persisted server-side; the response strips that ground truth and
 * serves the steps as a SHUFFLED tray (ordered by their position-independent id)
 * so the client never learns the true order before scoring.
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
  const scenario = await generateTraceFlowRound(difficulty, { avoidTopics });

  const roundId = randomUUID();
  db.insert(traceFlowRounds)
    .values({
      id: roundId,
      playerId: player.id,
      challengeId: challenge.id,
      difficulty,
      scenario: scenario as unknown as Record<string, unknown>,
      createdAt: new Date(),
    })
    .run();

  // Strip the ground truth — position, parallelGroup, broken hand-offs and the
  // loop-back — and serve the tray ordered by id (which is decoupled from the
  // true order), so the player gets a shuffled set with no ordering signal.
  const tray = [...scenario.steps]
    .map((s) => ({
      id: s.id,
      title: s.title,
      detail: s.detail,
      input: s.input,
      output: s.output,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const safeScenario = {
    topic: scenario.topic,
    shapeTier: scenario.shapeTier,
    shape: scenario.shape,
    workflowName: scenario.workflowName,
    brief: scenario.brief,
    goal: scenario.goal,
    steps: tray,
  };

  return NextResponse.json({
    roundId,
    difficulty,
    topic: scenario.topic,
    scenario: safeScenario,
  });
}
