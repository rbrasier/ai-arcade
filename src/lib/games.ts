import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { challenges, games, type Challenge, type Game } from "@/lib/db/schema";

export interface GameWithChallenges {
  game: Game;
  challenges: Challenge[];
}

/** Load a game and its ordered challenges by slug, or null if not found. */
export function getGameBySlug(slug: string): GameWithChallenges | null {
  const game = db.select().from(games).where(eq(games.slug, slug)).get();
  if (!game) return null;

  const gameChallenges = db
    .select()
    .from(challenges)
    .where(eq(challenges.gameId, game.id))
    .orderBy(asc(challenges.sortOrder))
    .all();

  return { game, challenges: gameChallenges };
}
