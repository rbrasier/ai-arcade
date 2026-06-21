import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  generateContextCalibrationOutput,
  type ContextCalibrationScenario,
} from "@/lib/ai/context-calibration";
import { db } from "@/lib/db/client";
import {
  attempts,
  challenges,
  contextCalibrationRounds,
  players,
} from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";
import { gradeSelection } from "@/lib/context-calibration-scoring";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

/**
 * Score a "Context Calibration" round. Grading is fully server-side against the
 * stored snippet kinds, on two axes (see docs/GAME-RULES.md):
 *
 *   completeness = essentialsIncluded / essentialsTotal   (the gate)
 *   focus        = 1 - weightedBadIncluded / weightedBadTotal  (distractors weigh 2×)
 *   scoreRatio   = 0.5 * completeness + 0.5 * focus  (capped at 0.5 if an essential is missing)
 *
 * The curated context is also executed so the scorecard can show what it
 * produced — illustrative only; it never affects the score.
 *
 * Body: { roundId: string, selectedItemIds: string[] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const selectedItemIds: string[] = Array.isArray(body?.selectedItemIds)
    ? body.selectedItemIds.filter((t: unknown): t is string => typeof t === "string")
    : [];

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = db
    .select()
    .from(contextCalibrationRounds)
    .where(eq(contextCalibrationRounds.id, roundId))
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

  const scenario = round.scenario as unknown as ContextCalibrationScenario;
  const selected = new Set(selectedItemIds);
  const selectedItems = scenario.items.filter((it) => selected.has(it.id));

  const graded = gradeSelection(scenario.items, selectedItemIds);
  const score = Math.round(graded.scoreRatio * challenge.maxScore);
  const xpEarned = Math.round(challenge.xpReward * graded.scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, graded.scoreRatio);

  // Run the player's curated context to show the deliverable it produced.
  const output = await generateContextCalibrationOutput({
    scenario,
    selectedItems,
  });

  // Per-item breakdown for the debrief: the kind, and whether it was attached.
  const items = scenario.items.map((it) => ({
    id: it.id,
    text: it.text,
    kind: it.kind,
    reason: it.reason,
    selected: selected.has(it.id),
  }));

  const missedEssential = graded.essentialsIncluded < graded.essentialsTotal;
  const feedback = `${graded.essentialsIncluded}/${graded.essentialsTotal} essentials kept · ${graded.distractorIncluded} distractor${graded.distractorIncluded === 1 ? "" : "s"} attached.`;

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ roundId, selectedItemIds, output }),
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
    completeness: Math.round(graded.completeness * 100),
    focus: Math.round(graded.focus * 100),
    essentialsTotal: graded.essentialsTotal,
    essentialsIncluded: graded.essentialsIncluded,
    distractorTotal: graded.distractorTotal,
    distractorIncluded: graded.distractorIncluded,
    missedEssential,
    items,
    goal: scenario.goal,
    output,
    explanation: scenario.explanation,
    xpEarned,
    bonusXp,
    exceptional: graded.exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
