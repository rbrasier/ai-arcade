import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { attempts, challenges, games, players } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

/**
 * Marks the introductory "AI Foundations" course complete for the current
 * player. Unlike the games, the course is not AI-scored: reaching the end of
 * the slides is the whole task, so this awards full marks (100%) deterministically.
 *
 * Clearing the course's single challenge unlocks the next game via the standard
 * progression rule in `src/lib/progress.ts`. The endpoint is idempotent — a
 * player who has already cleared it can replay the course without re-earning XP.
 */
export async function POST() {
  const game = db
    .select()
    .from(games)
    .where(eq(games.slug, "ai-foundations"))
    .get();
  if (!game) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const challenge = db
    .select()
    .from(challenges)
    .where(eq(challenges.gameId, game.id))
    .get();
  if (!challenge) {
    return NextResponse.json(
      { error: "Course challenge not found" },
      { status: 404 },
    );
  }

  const player = await getOrCreatePlayer();

  // Idempotent: if the player has already cleared the course, don't award XP
  // again on a replay — just confirm completion.
  const existing = db
    .select({ score: attempts.score })
    .from(attempts)
    .where(
      and(
        eq(attempts.playerId, player.id),
        eq(attempts.challengeId, challenge.id),
      ),
    )
    .all();
  const alreadyCleared = existing.some(
    (a) => a.score >= challenge.maxScore,
  );

  if (alreadyCleared) {
    return NextResponse.json({
      ok: true,
      alreadyComplete: true,
      score: challenge.maxScore,
      maxScore: challenge.maxScore,
      xpEarned: 0,
      bonusXp: 0,
      player: { xp: player.xp, level: player.level },
    });
  }

  // Everyone who reaches the end scores 100%.
  const score = challenge.maxScore;
  const xpEarned = challenge.xpReward;
  // Common XP-bonus rule (docs/GAME-RULES.md): a perfect ratio earns the top tier.
  const bonusXp = bonusForScoreRatio(challenge.xpReward, 1);

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: "Completed the AI Foundations course.",
      evaluation: {
        score,
        feedback: "Course completed — all eight foundations covered.",
        exceptional: false,
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
    ok: true,
    alreadyComplete: false,
    score,
    maxScore: challenge.maxScore,
    xpEarned,
    bonusXp,
    player: { xp: newXp, level: newLevel },
  });
}
