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

/** Per-claim credit for the three-state mechanic (see docs/GAME-RULES.md). */
const CREDIT_CORRECT = 1;
const CREDIT_UNMARKED = 0.5; // a sound claim left unmarked — neutral, no penalty
const CREDIT_MISSED = 0.25; // a fabrication left unmarked — you let it slip
const CREDIT_WRONG = 0;

/**
 * Score a "Spot the Hallucination" round. Grading is fully server-side against
 * the stored ground truth — the client sends, per claim, whether it flagged the
 * claim as fabricated or verified it as sound (anything else is left unmarked).
 *
 * Each claim earns credit toward accuracy:
 * - correct verdict (flag a fabrication / verify a sound claim) → 1
 * - a sound claim left unmarked (no commitment, no penalty)     → 0.5
 * - a fabrication left unmarked (you let it slip)               → 0.25
 * - wrong verdict (flag a sound claim / vouch for a fabrication) → 0
 *
 * So leaving everything unmarked scores at most 50% (and less when there are
 * fabrications you failed to catch) — always below the 65% clear — a false flag
 * costs you versus leaving the claim alone, and missing a fabrication bites.
 *
 * Body: { roundId: string, flaggedClaimIds: string[], verifiedClaimIds: string[] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const flaggedClaimIds: string[] = Array.isArray(body?.flaggedClaimIds)
    ? body.flaggedClaimIds
    : [];
  const verifiedClaimIds: string[] = Array.isArray(body?.verifiedClaimIds)
    ? body.verifiedClaimIds
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
  // A claim can't be both flagged and verified; flagging wins if a client ever
  // sends both for the same id.
  const verified = new Set(
    verifiedClaimIds.filter((id) => !flagged.has(id)),
  );

  // Grade each claim against the three-state mechanic.
  let caught = 0; // fabrication correctly flagged
  let missed = 0; // fabrication left unmarked
  let vouched = 0; // fabrication wrongly verified (worst case)
  let verifiedCorrect = 0; // sound claim correctly verified
  let falseAccusations = 0; // sound claim wrongly flagged
  let creditSum = 0;
  const totalHall = scenario.claims.filter((c) => c.hallucination).length;

  const resultClaims = scenario.claims.map((c) => {
    const isFlagged = flagged.has(c.id);
    const isVerified = verified.has(c.id);
    let status:
      | "caught"
      | "missed"
      | "vouched"
      | "verified-correct"
      | "false-accusation"
      | "unmarked";
    let credit: number;
    if (c.hallucination) {
      if (isFlagged) {
        caught += 1;
        status = "caught";
        credit = CREDIT_CORRECT;
      } else if (isVerified) {
        vouched += 1;
        status = "vouched";
        credit = CREDIT_WRONG;
      } else {
        missed += 1;
        status = "missed";
        credit = CREDIT_MISSED;
      }
    } else {
      if (isVerified) {
        verifiedCorrect += 1;
        status = "verified-correct";
        credit = CREDIT_CORRECT;
      } else if (isFlagged) {
        falseAccusations += 1;
        status = "false-accusation";
        credit = CREDIT_WRONG;
      } else {
        status = "unmarked";
        credit = CREDIT_UNMARKED;
      }
    }
    creditSum += credit;
    return {
      id: c.id,
      text: c.text,
      hallucination: c.hallucination,
      flagged: isFlagged,
      verified: isVerified,
      status,
    };
  });

  const total = scenario.claims.length;
  const accuracy = total > 0 ? creditSum / total : 0;
  const score = Math.round(accuracy * challenge.maxScore);

  const scoreRatio = challenge.maxScore > 0 ? score / challenge.maxScore : 0;
  const xpEarned = Math.round(challenge.xpReward * scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, scoreRatio);

  // Perfect round: every claim correctly classified — fabrications flagged,
  // sound claims verified, nothing left unmarked or mis-judged.
  const exceptional = total > 0 && creditSum === total;

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ flaggedClaimIds, verifiedClaimIds, roundId }),
      evaluation: {
        score,
        feedback: `Caught ${caught}/${totalHall} fabrications, verified ${verifiedCorrect} sound claim(s), ${falseAccusations} false accusation(s)${vouched ? `, vouched for ${vouched} fabrication(s)` : ""}.`,
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
    vouched,
    verifiedCorrect,
    falseAccusations,
    xpEarned,
    bonusXp,
    exceptional,
    claims: resultClaims,
    explanations: scenario.explanations,
    player: { xp: newXp, level: newLevel },
  });
}
