import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  countWords,
  evaluatePromptGolfSubmission,
  type PromptGolfScenario,
} from "@/lib/ai/prompt-golf";
import { db } from "@/lib/db/client";
import { attempts, challenges, players, promptGolfRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

/**
 * Score a "Prompt Golf" submission. The player's prompt is judged for
 * **precision** (the share of the round's criteria it covers, via the AI
 * connector or its mock) and **word economy** (how close to / under par it is).
 *
 *   precision = criteriaMet / criteriaTotal
 *   economy   = wordRatio <= 1 ? 1 : max(0, 1 - (wordRatio - 1))   // wordRatio = words / par
 *   scoreRatio = 0.7 * precision + 0.3 * economy
 *
 * Precision is the gate: a brief but off-target prompt can't clear. See
 * docs/GAME-RULES.md.
 *
 * Body: { roundId: string, prompt: string }
 */
const PRECISION_WEIGHT = 0.7;
const ECONOMY_WEIGHT = 0.3;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = db
    .select()
    .from(promptGolfRounds)
    .where(eq(promptGolfRounds.id, roundId))
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

  const scenario = round.scenario as unknown as PromptGolfScenario;
  const words = countWords(prompt);
  const par = scenario.par;

  // Precision — judged against the stored ground-truth criteria.
  const evaluation = await evaluatePromptGolfSubmission({ scenario, prompt });
  const total = scenario.criteria.length;
  const met = evaluation.criteria.filter((c) => c.met).length;
  const precision = total > 0 ? met / total : 0;

  // Economy — full marks at or under par, linear penalty above it (0 at 2× par).
  const wordRatio = par > 0 ? words / par : 1;
  const economy = wordRatio <= 1 ? 1 : Math.max(0, 1 - (wordRatio - 1));

  const scoreRatio = PRECISION_WEIGHT * precision + ECONOMY_WEIGHT * economy;
  const score = Math.round(scoreRatio * challenge.maxScore);

  const xpEarned = Math.round(challenge.xpReward * scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, scoreRatio);
  const exceptional = precision === 1 && words <= par;

  // Echo per-criterion results joined to their text for the debrief.
  const criteria = scenario.criteria.map((c) => {
    const got = evaluation.criteria.find((e) => e.id === c.id);
    return {
      id: c.id,
      text: c.text,
      met: got?.met ?? false,
      note: got?.note ?? "Not addressed by the prompt.",
    };
  });

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ prompt, roundId, words }),
      evaluation: {
        score,
        feedback: `${met}/${total} criteria covered · ${words} words vs par ${par}.`,
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
    precision: Math.round(precision * 100),
    economy: Math.round(economy * 100),
    criteriaMet: met,
    criteriaTotal: total,
    words,
    par,
    criteria,
    feedback: evaluation.feedback,
    xpEarned,
    bonusXp,
    exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
