import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  generateRightToolOutcome,
  type RightToolScenario,
} from "@/lib/ai/right-tool-for-the-job";
import { db } from "@/lib/db/client";
import { attempts, challenges, players, rightToolRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import {
  gradeChoice,
  type Intervention,
} from "@/lib/right-tool-for-the-job-scoring";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

const VALID: Intervention[] = ["manual", "rules", "llm", "custom-app"];

/**
 * Score a "Fit for Purpose" (Right Tool for the Job) round. Grading is fully
 * server-side and deterministic against the stored cost params (see
 * docs/GAME-RULES.md):
 *
 *   annualCost(opt) = build/3 + maintenance + errorRate*volume*risk + residualMin*volume*0.75
 *   scoreRatio = clamp(1 − (annualCost(chosen) − annualCost(best)) / annualCost(manual), 0, 1)
 *
 * The chosen tool's year is then narrated so the scorecard shows what the choice
 * produced — illustrative only; it never affects the score.
 *
 * Body: { roundId: string, chosen: Intervention }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const chosen = body?.chosen as Intervention | undefined;

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }
  if (!chosen || !VALID.includes(chosen)) {
    return NextResponse.json(
      { error: "a valid intervention is required" },
      { status: 400 },
    );
  }

  const round = db
    .select()
    .from(rightToolRounds)
    .where(eq(rightToolRounds.id, roundId))
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

  const scenario = round.scenario as unknown as RightToolScenario;

  const graded = gradeChoice(scenario.options, scenario.characteristics, chosen);
  const score = Math.round(graded.scoreRatio * challenge.maxScore);
  const xpEarned = Math.round(challenge.xpReward * graded.scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, graded.scoreRatio);

  // Narrate the chosen tool's year so the scorecard shows what it produced.
  const output = await generateRightToolOutcome({ scenario, chosen, graded });

  const feedback =
    graded.verdict === "right"
      ? "Picked the best-value tool."
      : graded.verdict === "over-built"
        ? `Over-built — about £${Math.round(graded.regret).toLocaleString("en-GB")}/yr wasted vs the best option.`
        : `Under-built — about £${Math.round(graded.regret).toLocaleString("en-GB")}/yr left on the table vs the best option.`;

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ roundId, chosen, output }),
      evaluation: {
        score,
        feedback,
        exceptional: graded.exceptional,
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
    scoreRatio: graded.scoreRatio,
    chosen,
    bestIntervention: graded.bestIntervention,
    verdict: graded.verdict,
    regret: Math.round(graded.regret),
    options: graded.options.map((o) => ({
      ...o,
      amortisedBuild: Math.round(o.amortisedBuild),
      annualMaintenance: Math.round(o.annualMaintenance),
      failureCost: Math.round(o.failureCost),
      residualLabour: Math.round(o.residualLabour),
      annualCost: Math.round(o.annualCost),
      savings: Math.round(o.savings),
    })),
    characteristics: scenario.characteristics,
    stepTitle: scenario.stepTitle,
    stepDetail: scenario.stepDetail,
    goal: scenario.goal,
    tier: scenario.tier,
    output,
    explanation: scenario.explanation,
    xpEarned,
    bonusXp,
    exceptional: graded.exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
