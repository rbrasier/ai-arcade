import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  attempts,
  challenges,
  games,
  players,
  type Game,
  type GameStatus,
} from "@/lib/db/schema";

/**
 * A challenge counts as "cleared" once an attempt scores at least this share.
 * Common game rule (see docs/GAME-RULES.md): clearing at 65% unlocks
 * progression to the next level/game.
 */
const CLEAR_THRESHOLD = 0.65;

/** How many non-completed games are unlocked beyond those already completed. */
const ALWAYS_AVAILABLE = 2;

export interface GameWithProgress extends Game {
  status: GameStatus;
  totalChallenges: number;
  clearedChallenges: number;
  xpEarned: number;
}

/**
 * Returns all active games for a player, ordered, with progress and a derived
 * status. The unlock rule guarantees the player always has at least
 * `ALWAYS_AVAILABLE` (2) playable games until everything is completed.
 */
export function getGamesWithProgress(playerId: string): GameWithProgress[] {
  const allGames = db
    .select()
    .from(games)
    .where(eq(games.isActive, true))
    .orderBy(games.sortOrder)
    .all();

  // Test/QA players have every game unlocked forever, bypassing the normal
  // clear-to-unlock progression (see `enableTestMode` / the `?testMode` link).
  const testMode = Boolean(
    db
      .select({ testMode: players.testMode })
      .from(players)
      .where(eq(players.id, playerId))
      .get()?.testMode,
  );

  // Total challenges per game.
  const totals = db
    .select({
      gameId: challenges.gameId,
      total: sql<number>`count(*)`,
    })
    .from(challenges)
    .groupBy(challenges.gameId)
    .all();
  const totalByGame = new Map(totals.map((t) => [t.gameId, Number(t.total)]));

  // Per-game cleared challenge count + XP earned for this player.
  const perGame = db
    .select({
      gameId: challenges.gameId,
      cleared: sql<number>`count(distinct case when ${attempts.score} >= ${challenges.maxScore} * ${CLEAR_THRESHOLD} then ${attempts.challengeId} end)`,
      xp: sql<number>`coalesce(sum(${attempts.xpEarned} + ${attempts.bonusXp}), 0)`,
    })
    .from(challenges)
    .leftJoin(
      attempts,
      and(
        eq(attempts.challengeId, challenges.id),
        eq(attempts.playerId, playerId),
      ),
    )
    .groupBy(challenges.gameId)
    .all();
  const statsByGame = new Map(
    perGame.map((g) => [g.gameId, { cleared: Number(g.cleared), xp: Number(g.xp) }]),
  );

  // First pass: figure out which games are fully completed. "Coming soon" games
  // (seeded but not yet playable) can never be completed, so they are excluded
  // from the unlock gate entirely — they must not count toward, or block, the
  // progression of the playable games around them.
  const completedFlags = allGames.map((game) => {
    if (game.comingSoon) return false;
    const total = totalByGame.get(game.id) ?? 0;
    const cleared = statsByGame.get(game.id)?.cleared ?? 0;
    return total > 0 && cleared >= total;
  });
  const completedCount = completedFlags.filter(Boolean).length;
  const unlockThreshold = completedCount + ALWAYS_AVAILABLE;

  // A game's unlock position counts only the playable games before it, so a
  // coming-soon game in the middle of the arc neither shifts that count nor
  // gates on its own (never-reachable) completion.
  let playablePos = 0;

  return allGames.map((game, index) => {
    const total = totalByGame.get(game.id) ?? 0;
    const stats = statsByGame.get(game.id) ?? { cleared: 0, xp: 0 };
    const completed = completedFlags[index];
    const pos = playablePos;
    if (!game.comingSoon) playablePos += 1;

    let status: GameStatus;
    if (completed) {
      status = "completed";
    } else if (testMode || pos < unlockThreshold) {
      status = stats.cleared > 0 ? "in_progress" : "available";
    } else {
      status = "locked";
    }

    return {
      ...game,
      status,
      totalChallenges: total,
      clearedChallenges: stats.cleared,
      xpEarned: stats.xp,
    };
  });
}

export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  xp: number;
  rank: number;
}

/** Top players by total XP (all time) or XP earned in the last 7 days. */
export function getLeaderboard(
  range: "week" | "all",
  limit = 10,
): LeaderboardEntry[] {
  if (range === "all") {
    const rows = db
      .select({
        playerId: sql<string>`players.id`,
        displayName: sql<string>`players.display_name`,
        xp: sql<number>`players.xp`,
      })
      .from(sql`players`)
      .orderBy(sql`players.xp desc`)
      .limit(limit)
      .all();
    return rows.map((r, i) => ({ ...r, xp: Number(r.xp), rank: i + 1 }));
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = db
    .select({
      playerId: sql<string>`players.id`,
      displayName: sql<string>`players.display_name`,
      xp: sql<number>`coalesce(sum(${attempts.xpEarned} + ${attempts.bonusXp}), 0)`,
    })
    .from(sql`players`)
    .leftJoin(
      attempts,
      and(
        sql`${attempts.playerId} = players.id`,
        gte(attempts.createdAt, weekAgo),
      ),
    )
    .groupBy(sql`players.id`)
    .all();

  return rows
    .map((r) => ({ ...r, xp: Number(r.xp) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
