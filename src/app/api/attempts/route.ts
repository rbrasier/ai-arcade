import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getAiProvider } from "@/lib/ai";
import { db } from "@/lib/db/client";
import { attempts, challenges, games, players } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const challengeId = body?.challengeId as string | undefined;
  const response = body?.response as string | undefined;

  if (!challengeId || typeof response !== "string") {
    return NextResponse.json(
      { error: "challengeId and response are required" },
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

  const game = db
    .select()
    .from(games)
    .where(eq(games.id, challenge.gameId))
    .get();
  if (!game) {
    return NextResponse.json({ error: "Unknown game" }, { status: 404 });
  }

  const player = await getOrCreatePlayer();

  // Score the answer with the AI engine (or mock fallback).
  const evaluation = await getAiProvider().evaluateAttempt({
    game: { slug: game.slug, title: game.title },
    challenge: {
      title: challenge.title,
      prompt: challenge.prompt,
      maxScore: challenge.maxScore,
      config: challenge.config,
    },
    response,
  });

  const scoreRatio =
    challenge.maxScore > 0 ? evaluation.score / challenge.maxScore : 0;
  const xpEarned = Math.round(challenge.xpReward * scoreRatio);
  // Common XP-bonus rule (docs/GAME-RULES.md): tiered on the score ratio.
  const bonusXp = bonusForScoreRatio(challenge.xpReward, scoreRatio);

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score: evaluation.score,
      xpEarned,
      bonusXp,
      response,
      evaluation,
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
    score: evaluation.score,
    maxScore: challenge.maxScore,
    xpEarned,
    bonusXp,
    feedback: evaluation.feedback,
    exceptional: evaluation.exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
