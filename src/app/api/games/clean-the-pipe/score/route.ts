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
  bestPathForKind,
  errorsFor,
  gradeCleanThePipe,
  sourceVerdict,
  type SourcePath,
} from "@/lib/clean-the-pipe-scoring";
import { bonusForScoreRatio, levelForXp } from "@/lib/xp";

const SOURCE_PATHS = new Set<SourcePath>(["keep", "redirect", "migrate", "exclude"]);

/** Coerce an untrusted path map into a typed record, dropping anything unknown. */
function cleanPaths<T extends string>(
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
 * stored source ground truth (see docs/GAME-RULES.md): a pipeline simulation is
 * run three ways — do nothing, the player's chosen paths, and the best possible
 * — and the round is scored on how far the player cut total errors (AI + human +
 * omission) from the do-nothing baseline toward the best achievable, capped
 * below the clear if a critical source is left poisoning the output.
 *
 * The step's deliverable is then narrated before vs after — illustrative only;
 * never affects the score.
 *
 * Body: { roundId: string, paths: {id: path} }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  // Accept `paths` (new) or `actions` (legacy) for resilience.
  const paths = cleanPaths<SourcePath>(body?.paths ?? body?.actions, SOURCE_PATHS);

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

  const graded = gradeCleanThePipe(scenario.sources, paths);
  const score = Math.round(graded.scoreRatio * challenge.maxScore);
  const xpEarned = Math.round(challenge.xpReward * graded.scoreRatio);
  const bonusXp = bonusForScoreRatio(challenge.xpReward, graded.scoreRatio);

  // Narrate the deliverable before vs after the player's redesign. Feedback only.
  const output = await generateCleanThePipeOutcome({ scenario, paths });

  // Per-source breakdown for the debrief: the ground truth, the player's path,
  // the best path and the error tally each produced.
  const sources = scenario.sources.map((s) => {
    const path = paths[s.id] ?? "keep";
    const bestPath = bestPathForKind(s.kind);
    return {
      id: s.id,
      type: s.type,
      label: s.label,
      summary: s.summary,
      usedFor: s.usedFor,
      volume: s.volume,
      ongoing: s.ongoing,
      migrationEffortHours: s.migrationEffortHours,
      kind: s.kind,
      reason: s.reason,
      path,
      bestPath,
      verdict: sourceVerdict(s.kind, path, s.volume),
      yourErrors: Math.round(errorsFor(s, path).total),
      bestErrors: Math.round(errorsFor(s, bestPath).total),
    };
  });

  const feedback = `${graded.bestPicks}/${graded.sourcesTotal} sources on their best path · ${graded.simulation.yours.total} errors/qtr (best ${graded.simulation.best.total}).`;

  db.insert(attempts)
    .values({
      id: randomUUID(),
      playerId: player.id,
      challengeId: challenge.id,
      score,
      xpEarned,
      bonusXp,
      response: JSON.stringify({ roundId, paths, output }),
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
    errorReduction: Math.round(graded.errorReduction * 100),
    gateTripped: graded.gateTripped,
    poisonedSources: graded.poisonedSources,
    bestPicks: graded.bestPicks,
    overMigrated: graded.overMigrated,
    sourcesTotal: graded.sourcesTotal,
    simulation: graded.simulation,
    sources,
    stepName: scenario.stepName,
    goal: scenario.goal,
    output,
    explanation: scenario.explanation,
    xpEarned,
    bonusXp,
    exceptional: graded.exceptional,
    player: { xp: newXp, level: newLevel },
  });
}
