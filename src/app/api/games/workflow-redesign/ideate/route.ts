import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  chatIdeation,
  type IdeationMessage,
  type WorkflowRedesignScenario,
} from "@/lib/ai/workflow-redesign";
import { db } from "@/lib/db/client";
import { workflowRedesignRounds } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

/**
 * Phase 2 (Ideation): a multi-turn chat where the player thinks the workflow
 * through with an AI coach. Each call takes the conversation so far and returns
 * the coach's next reply plus a refreshed list of "top takeaways" distilled from
 * the whole conversation, which the player carries into the Build phase.
 * Formative and UNSCORED — it records nothing and awards no XP.
 *
 * Body: { roundId: string, messages: { role: "user" | "assistant"; content: string }[] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const roundId = body?.roundId as string | undefined;
  const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
  const messages: IdeationMessage[] = rawMessages
    .filter(
      (m: unknown): m is IdeationMessage =>
        !!m &&
        typeof (m as IdeationMessage).content === "string" &&
        ((m as IdeationMessage).role === "user" ||
          (m as IdeationMessage).role === "assistant"),
    )
    .slice(-12);

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
  const { reply, takeaways } = await chatIdeation({ scenario, messages });

  return NextResponse.json({ reply, takeaways });
}
