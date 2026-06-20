import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import type { ChainOfThoughtScenario } from "@/lib/ai/chain-of-thought";
import { db } from "@/lib/db/client";
import {
  attempts,
  chainOfThoughtRounds,
  challenges,
  players,
} from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import {
  isExceptional,
  judgmentCorrect,
  scoreRatioFor,
} from "@/lib/chain-of-thought-scoring";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

/**
 * Score a "Think It Through" round. Grading is fully server-side against the
 * stored ground truth, on two binary axes (see docs/GAME-RULES.md):
 *
 *   accuracy = chosenOptionId === correctOptionId   (the gate)
 *   judgment = trusted === snapCorrect              (the mastery axis)
 *   scoreRatio = 0.65 * accuracy + 0.35 * judgment
 *
 * So a correct final answer clears (0.65); a correct trust call lifts it into the
 * XP-bonus tiers, and both correct is an exceptional 100. A wrong final answer
 * caps the round at 0.35 — below the 65% clear.
 *
 * Body: { roundId: string, trusted: boolean, chosenOptionId: string }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const trusted = body?.trusted === true;
  const chosenOptionId =
    typeof body?.chosenOptionId === "string" ? body.chosenOptionId : "";

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = db
    .select()
    .from(chainOfThoughtRounds)
    .where(eq(chainOfThoughtRounds.id, roundId))
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

  const scenario = round.scenario as unknown as ChainOfThoughtScenario;

  const accuracy = chosenOptionId === scenario.correctOptionId;
  const judgment = judgmentCorrect(trusted, scenario.snapCorrect);
  const scoreRatio = scoreRatioFor(accuracy, judgment);
  const score = Math.round(scoreRatio * challenge.maxScore);

  const xpEarned = Math.round(challenge.xpReward * scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, scoreRatio);
  const exceptional = isExceptional(accuracy, judgment);

  const judgmentLabel = judgment
    ? trusted
      ? "rightly trusted the quick answer"
      : "rightly demanded the working"
    : trusted
      ? "trusted a wrong snap answer"
      : "demanded working that wasn't needed";

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ roundId, trusted, chosenOptionId }),
      evaluation: {
        score,
        feedback: `${accuracy ? "Correct answer" : "Wrong answer"}; ${judgmentLabel}.`,
        exceptional,
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
    accuracy,
    judgment,
    trusted,
    snapCorrect: scenario.snapCorrect,
    chosenOptionId,
    correctOptionId: scenario.correctOptionId,
    snapAnswerId: scenario.snapAnswerId,
    options: scenario.options,
    reasoning: scenario.reasoning,
    explanation: scenario.explanation,
    xpEarned,
    bonusXp,
    exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
