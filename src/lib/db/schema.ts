import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Players are anonymous: created automatically on first visit and tied to a
 * cookie. They can set a display name but there are no passwords.
 */
export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** A mini-game. Games are ordered and unlock progressively. */
export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull(),
  estMinutes: integer("est_minutes").notNull().default(24),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

/** A single challenge within a game. `config` holds per-game-type JSON. */
export const challenges = sqliteTable("challenges", {
  id: text("id").primaryKey(),
  gameId: text("game_id")
    .notNull()
    .references(() => games.id),
  sortOrder: integer("sort_order").notNull(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
  maxScore: integer("max_score").notNull().default(100),
  xpReward: integer("xp_reward").notNull().default(100),
});

/** A scored attempt at a challenge. Drives XP, bonuses and the leaderboard. */
export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  playerId: text("player_id")
    .notNull()
    .references(() => players.id),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id),
  score: integer("score").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  bonusXp: integer("bonus_xp").notNull().default(0),
  response: text("response").notNull(),
  evaluation: text("evaluation", { mode: "json" }).$type<{
    score: number;
    feedback: string;
    exceptional: boolean;
  }>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type GameStatus =
  | "locked"
  | "available"
  | "in_progress"
  | "completed";

/** Per-player progress through each game. */
export const playerGameProgress = sqliteTable(
  "player_game_progress",
  {
    id: text("id").primaryKey(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id),
    status: text("status").$type<GameStatus>().notNull().default("locked"),
    completedChallenges: integer("completed_challenges").notNull().default(0),
  },
  (table) => [
    uniqueIndex("player_game_unique").on(table.playerId, table.gameId),
  ],
);

/**
 * A generated "Spot the Hallucination" round. The full scenario — including
 * which claims are fabricated — is stored server-side so grading never trusts
 * the client. Created when a round is generated; read back when scored.
 */
export const hallucinationRounds = sqliteTable("hallucination_rounds", {
  id: text("id").primaryKey(),
  playerId: text("player_id")
    .notNull()
    .references(() => players.id),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id),
  difficulty: integer("difficulty").notNull().default(1),
  scenario: text("scenario", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type PlayerGameProgress = typeof playerGameProgress.$inferSelect;
export type HallucinationRound = typeof hallucinationRounds.$inferSelect;
