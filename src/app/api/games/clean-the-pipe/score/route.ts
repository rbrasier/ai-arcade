import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  generateCleanThePipeOutcome,
  type CleanThePipeScenario,
} from "@/lib/ai/clean-the-pipe";
import { db } from "@/lib/db/client";
import {
  attempts,
  challenges,
  cleanThePipeRounds,
  players,
} from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import {
  computeCleanThePipeImpact,
  gradeCleanThePipe,
  type TriageAction,
} from "@/lib/clean-the-pipe-scoring";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

const TRIAGE_ACTIONS = new Set<TriageAction>(["pass", "repair", "bin"]);

/** Coerce an untrusted action map into a typed record, dropping anything unknown. */
function cleanActions<T extends string>(
  raw: unknown,
  valid: Set<T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  if (raw && typeof raw === "object") {
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string" && valid.has(value as T)) {
        out[id] = value as T;
      }
    }
  }
  return out;
}

/**
 * Score a "Clean the Pipe" round. Grading is fully server-side against the
 * stored item ground truth, on two axes (see docs/GAME-RULES.md):
 *
 *   accuracy = creditSum / consequentialTotal   (the gate — catch what poisons)
 *   effort   = 1 - wastedEffort / maxWaste      (calibrate cleaning to consequence)
 *   scoreRatio = 0.5 * accuracy + 0.5 * effort  (capped at 0.5 if a consequential item is left)
 *
 * The step is then "run" on the raw vs the triaged data so the scorecard can
 * show the deliverable each produced — illustrative only; never affects the score.
 *
 * Body: { roundId: string, actions: {id: action} }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const actions = cleanActions<TriageAction>(body?.actions, TRIAGE_ACTIONS);

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = db
    .select()
    .from(cleanThePipeRounds)
    .where(eq(cleanThePipeRounds.id, roundId))
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

  const scenario = round.scenario as unknown as CleanThePipeScenario;

  const graded = gradeCleanThePipe(scenario.items, actions);
  const score = Math.round(graded.scoreRatio * challenge.maxScore);
  const xpEarned = Math.round(challenge.xpReward * graded.scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, graded.scoreRatio);

  // Run the step on the raw vs the triaged data to show what each produced.
  const output = await generateCleanThePipeOutcome({ scenario, actions });

  // Plain quality + effort read of the player's triage. Feedback only.
  const impact = computeCleanThePipeImpact(scenario.items, actions);

  // Per-item breakdown for the debrief: the ground truth plus what the player did.
  const items = scenario.items.map((it) => ({
    id: it.id,
    kind: it.kind,
    label: it.label,
    content: it.content,
    usedFor: it.usedFor,
    repairedContent: it.repairedContent,
    migrationEffort: it.migrationEffort,
    consequential: it.consequential,
    correctAction: it.correctAction,
    reason: it.reason,
    action: actions[it.id] ?? "pass",
  }));

  const feedback = `${graded.cleanCorrect}/${graded.consequentialTotal} consequential items handled right · ${graded.overCleaned} needless clean-up${graded.overCleaned === 1 ? "" : "s"}.`;

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ roundId, actions, output }),
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
    accuracy: Math.round(graded.accuracy * 100),
    effort: Math.round(graded.effort * 100),
    consequentialTotal: graded.consequentialTotal,
    cleanCorrect: graded.cleanCorrect,
    missedConsequential: graded.missedConsequential,
    overCleaned: graded.overCleaned,
    items,
    stepName: scenario.stepName,
    datasetName: scenario.datasetName,
    goal: scenario.goal,
    output,
    impact,
    explanation: scenario.explanation,
    xpEarned,
    bonusXp,
    exceptional: graded.exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
