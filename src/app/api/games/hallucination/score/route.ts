import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import {
  attempts,
  challenges,
  hallucinationRounds,
  players,
} from "@/lib/db/schema";
import type { HallucinationScenario } from "@/lib/ai/hallucination";
import { getOrCreatePlayer } from "@/lib/player";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

/**
 * Score a "Spot the Hallucination" round. Grading is fully server-side against
 * the stored ground truth — the client only sends which claim ids it flagged.
 *
 * Body: { roundId: string, flaggedClaimIds: string[] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const flaggedClaimIds: string[] = Array.isArray(body?.flaggedClaimIds)
    ? body.flaggedClaimIds
    : [];

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = db
    .select()
    .from(hallucinationRounds)
    .where(eq(hallucinationRounds.id, roundId))
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

  const scenario = round.scenario as unknown as HallucinationScenario;
  const flagged = new Set(flaggedClaimIds);

  // Grade each claim: a correct decision flags a fabrication or leaves a sound
  // claim alone.
  let caught = 0;
  let missed = 0;
  let falseAccusations = 0;
  const totalHall = scenario.claims.filter((c) => c.hallucination).length;

  const resultClaims = scenario.claims.map((c) => {
    const isFlagged = flagged.has(c.id);
    let status: "caught" | "missed" | "false-accusation" | "correct-pass";
    if (c.hallucination && isFlagged) {
      caught += 1;
      status = "caught";
    } else if (c.hallucination && !isFlagged) {
      missed += 1;
      status = "missed";
    } else if (!c.hallucination && isFlagged) {
      falseAccusations += 1;
      status = "false-accusation";
    } else {
      status = "correct-pass";
    }
    return {
      id: c.id,
      text: c.text,
      hallucination: c.hallucination,
      flagged: isFlagged,
      status,
    };
  });

  const total = scenario.claims.length;
  const correctDecisions = resultClaims.filter(
    (c) => c.status === "caught" || c.status === "correct-pass",
  ).length;
  const accuracy = total > 0 ? correctDecisions / total : 0;
  const score = Math.round(accuracy * challenge.maxScore);

  const scoreRatio = challenge.maxScore > 0 ? score / challenge.maxScore : 0;
  const xpEarned = Math.round(challenge.xpReward * scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, scoreRatio);

  const exceptional = missed === 0 && falseAccusations === 0;

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ flaggedClaimIds, roundId }),
      evaluation: {
        score,
        feedback: `Caught ${caught}/${totalHall} fabrications with ${falseAccusations} false accusation(s).`,
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
    accuracy: Math.round(accuracy * 100),
    caught,
    totalHallucinations: totalHall,
    missed,
    falseAccusations,
    xpEarned,
    bonusXp,
    exceptional,
    claims: resultClaims,
    explanations: scenario.explanations,
    player: { xp: newXp, level: newLevel },
  });
}
