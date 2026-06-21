import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  synthesiseIdeation,
  type WorkflowRedesignScenario,
} from "@/lib/ai/workflow-redesign";
import { db } from "@/lib/db/client";
import { workflowRedesignRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

/**
 * Phase 2 (Ideation): take the player's free-text analysis of the workflow and
 * return 2-4 structured insight bullets that prime the Build phase. Formative
 * and UNSCORED — it records nothing and awards no XP; it only helps the player
 * think before they redesign.
 *
 * Body: { roundId: string, notes: string }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const notes = typeof body?.notes === "string" ? body.notes : "";

  if (!roundId) {
    return NextResponse.json({ error: "roundId is required" }, { status: 400 });
  }

  const round = db
    .select()
    .from(workflowRedesignRounds)
    .where(eq(workflowRedesignRounds.id, roundId))
    .get();
  if (!round) {
    return NextResponse.json({ error: "Unknown round" }, { status: 404 });
  }

  const player = await getOrCreatePlayer();
  if (round.playerId !== player.id) {
    return NextResponse.json({ error: "Not your round" }, { status: 403 });
  }

  const scenario = round.scenario as unknown as WorkflowRedesignScenario;
  const insights = await synthesiseIdeation({ scenario, notes });

  return NextResponse.json({ insights });
}
