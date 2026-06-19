import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  countWords,
  evaluatePromptGolfSubmission,
  generatePromptGolfOutput,
  type PromptGolfScenario,
} from "@/lib/ai/prompt-golf";
import { db } from "@/lib/db/client";
import { attempts, challenges, players, promptGolfRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import {
  economyFor,
  isExceptional,
  scoreRatioFor,
} from "@/lib/prompt-golf-scoring";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

/**
 * Score a "Prompt Golf" submission. The player's prompt is judged for
 * **precision** (the share of the round's criteria it covers, via the AI
 * connector or its mock) and **word economy** (how close to the *fewest
 * possible* words it lands). Landing on par is a solid clear, not a top score:
 * full economy demands approaching the "ace". The prompt is also executed so
 * the scorecard can show what it actually produced.
 *
 *   precision = criteriaMet / criteriaTotal
 *   economy   = economyFor(words, par)   // 1 only near the ace, PAR_ECONOMY at par
 *   scoreRatio = 0.7 * precision + 0.3 * economy
 *
 * Precision is the gate: a brief but off-target prompt can't clear. See
 * docs/GAME-RULES.md and src/lib/prompt-golf-scoring.ts.
 *
 * Body: { roundId: string, prompt: string }
 */
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

  // Precision — judged against the stored ground-truth criteria — and the
  // deliverable the prompt would produce, in parallel to keep latency down.
  const [evaluation, output] = await Promise.all([
    evaluatePromptGolfSubmission({ scenario, prompt }),
    generatePromptGolfOutput({ scenario, prompt }),
  ]);
  const total = scenario.criteria.length;
  const met = evaluation.criteria.filter((c) => c.met).length;
  const precision = total > 0 ? met / total : 0;

  // Economy — full marks only near the ace (fewest possible words); par earns
  // partial credit and over-par decays to 0 at 2× par. See prompt-golf-scoring.
  const economy = economyFor(words, par);

  const scoreRatio = scoreRatioFor(precision, words, par);
  const score = Math.round(scoreRatio * challenge.maxScore);

  const xpEarned = Math.round(challenge.xpReward * scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, scoreRatio);
  const exceptional = isExceptional(precision, words, par);

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
      response: JSON.stringify({ prompt, roundId, words, output }),
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
    output,
    criteria,
    feedback: evaluation.feedback,
    xpEarned,
    bonusXp,
    exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
