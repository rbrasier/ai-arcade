import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { generatePromptGolfRound } from "@/lib/ai/prompt-golf";
import { db } from "@/lib/db/client";
import { challenges, promptGolfRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

/**
 * Generate a fresh "Prompt Golf" round. The full scenario (brief, criteria and
 * par) is persisted server-side so scoring later grades the submission against
 * the exact criteria — the client never gets to redefine the target.
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

  // Difficulty + mode come from the challenge config (Round 1..5).
  const config = challenge.config as
    | { difficulty?: number; mode?: string }
    | null;
  const configDifficulty = Number(config?.difficulty ?? 1);
  const difficulty = Number(body?.difficulty ?? configDifficulty) || 1;
  const rewrite = config?.mode === "rewrite";

  // Topics already used earlier in this play-through, so each round picks a
  // distinct theme.
  const avoidTopics: string[] = Array.isArray(body?.avoidTopics)
    ? body.avoidTopics.filter((t: unknown): t is string => typeof t === "string")
    : [];

  const player = await getOrCreatePlayer();
  const scenario = await generatePromptGolfRound(difficulty, {
    rewrite,
    avoidTopics,
  });

  const roundId = randomUUID();
  db.insert(promptGolfRounds)
    .values({
      id: roundId,
      playerId: player.id,
      challengeId: challenge.id,
      difficulty,
      scenario: scenario as unknown as Record<string, unknown>,
      createdAt: new Date(),
    })
    .run();

  // Strip the mock-only keyword hints before sending to the client (the
  // messyPrompt draft, if any, is shown to the player so it stays).
  const safeScenario = {
    ...scenario,
    criteria: scenario.criteria.map((c) => ({ id: c.id, text: c.text })),
  };

  return NextResponse.json({
    roundId,
    difficulty,
    topic: scenario.topic,
    scenario: safeScenario,
  });
}
