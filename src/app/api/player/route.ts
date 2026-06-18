import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { players } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

export async function GET() {
  const player = await getOrCreatePlayer();
  return NextResponse.json({ player });
}

/** Update the current player's display name. */
export async function PATCH(request: Request) {
  const player = await getOrCreatePlayer();
  const body = await request.json().catch(() => null);
  const displayName = (body?.displayName as string | undefined)?.trim();

  if (!displayName) {
    return NextResponse.json(
      { error: "displayName is required" },
      { status: 400 },
    );
  }

  db.update(players)
    .set({ displayName: displayName.slice(0, 40) })
    .where(eq(players.id, player.id))
    .run();

  return NextResponse.json({ player: { ...player, displayName } });
}
