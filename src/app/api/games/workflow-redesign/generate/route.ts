import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { generateWorkflowRedesignRound } from "@/lib/ai/workflow-redesign";
import { db } from "@/lib/db/client";
import { challenges, workflowRedesignRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

/**
 * Generate a fresh "Workflow Redesign Challenge" round. The full scenario —
 * including each stage's ground-truth capability / implementation / checkpoint
 * answers — is persisted server-side; the response strips that ground truth so
 * the client only ever sees the as-is workflow it has to redesign.
 *
 * Body: { challengeId: string, avoidTopics?: string[] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const challengeId = body?.challengeId as string | undefined;

  if (!challengeId) {
    return NextResponse.json(
      { error: "challengeId is required" },
      { status: 400 },
    );
  }

  const challenge = db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .get();
  if (!challenge) {
    return NextResponse.json({ error: "Unknown challenge" }, { status: 404 });
  }

  const scenarioKey =
    (challenge.config as { scenario?: string } | null)?.scenario ??
    "hr-onboarding";

  // Topics already used earlier in this play-through, so a replay picks a
  // distinct theme.
  const avoidTopics: string[] = Array.isArray(body?.avoidTopics)
    ? body.avoidTopics.filter((t: unknown): t is string => typeof t === "string")
    : [];

  const player = await getOrCreatePlayer();
  const scenario = await generateWorkflowRedesignRound(scenarioKey, {
    avoidTopics,
  });

  const roundId = randomUUID();
  db.insert(workflowRedesignRounds)
    .values({
      id: roundId,
      playerId: player.id,
      challengeId: challenge.id,
      scenarioKey,
      scenario: scenario as unknown as Record<string, unknown>,
      createdAt: new Date(),
    })
    .run();

  // Strip the ground truth — capability/impl/checkpoint answers — before sending
  // to the client. The player sees only the as-is workflow and its bottlenecks.
  const safeScenario = {
    topic: scenario.topic,
    scenarioKey: scenario.scenarioKey,
    workflowName: scenario.workflowName,
    brief: scenario.brief,
    goal: scenario.goal,
    stages: scenario.stages.map((s) => ({
      id: s.id,
      name: s.name,
      painPoint: s.painPoint,
      timeCost: s.timeCost,
    })),
  };

  return NextResponse.json({
    roundId,
    topic: scenario.topic,
    scenario: safeScenario,
  });
}
