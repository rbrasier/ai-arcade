import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { PLAYER_COOKIE } from "@/proxy";
import { db } from "@/lib/db/client";
import { players, type Player } from "@/lib/db/schema";

const FUN_NAMES = [
  "Curious Cadet",
  "Prompt Pilot",
  "Token Tinkerer",
  "Neon Novice",
  "Vector Voyager",
];

function randomDisplayName(): string {
  const base = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];
  return `${base} ${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Resolve the current player from the `arcade_pid` cookie set by `proxy.ts`,
 * creating the DB row on first sight. Safe to call from server components and
 * route handlers.
 */
export async function getOrCreatePlayer(): Promise<Player> {
  const cookieStore = await cookies();
  const playerId = cookieStore.get(PLAYER_COOKIE)?.value;

  if (!playerId) {
    // Should not happen behind the proxy, but fail soft for robustness.
    throw new Error("Missing player cookie; is proxy.ts configured?");
  }

  const existing = db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .get();
  if (existing) return existing;

  const created: Player = {
    id: playerId,
    displayName: randomDisplayName(),
    usernameSet: false,
    testMode: false,
    xp: 0,
    level: 1,
    createdAt: new Date(),
  };
  db.insert(players).values(created).run();
  return created;
}

/**
 * Permanently enable test mode for a player, unlocking every game forever.
 * Triggered by visiting the home page with the `?testMode` URL param (see the
 * subtle link at the bottom of the game ladder). Idempotent.
 */
export function enableTestMode(playerId: string): void {
  db
    .update(players)
    .set({ testMode: true })
    .where(eq(players.id, playerId))
    .run();
}
