import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { players } from "@/lib/db/schema";
import { getOrCreatePlayer } from "@/lib/player";

const MIN_NAME = 2;
const MAX_NAME = 40;

export async function GET() {
  const player = await getOrCreatePlayer();
  return NextResponse.json({ player });
}

/**
 * Update the current player's display name. The name must be unique across
 * players (case-insensitive); choosing one marks the player's username as set.
 */
export async function PATCH(request: Request) {
  const player = await getOrCreatePlayer();
  const body = await request.json().catch(() => null);
  const displayName = (body?.displayName as string | undefined)
    ?.trim()
    .slice(0, MAX_NAME);

  if (!displayName || displayName.length < MIN_NAME) {
    return NextResponse.json(
      { error: `Username must be at least ${MIN_NAME} characters.` },
      { status: 400 },
    );
  }

  // Enforce uniqueness ourselves (case-insensitive), ignoring the player's own
  // row so re-saving the same name is a no-op rather than a conflict.
  const taken = db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        sql`lower(${players.displayName}) = ${displayName.toLowerCase()}`,
        ne(players.id, player.id),
      ),
    )
    .get();

  if (taken) {
    return NextResponse.json(
      { error: "That username is taken — try another." },
      { status: 409 },
    );
  }

  db.update(players)
    .set({ displayName, usernameSet: true })
    .where(eq(players.id, player.id))
    .run();

  return NextResponse.json({
    player: { ...player, displayName, usernameSet: true },
  });
}
