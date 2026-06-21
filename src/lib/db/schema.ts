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
  // Null/false until the player chooses their own username (a placeholder name
  // is assigned on first visit so the UI/leaderboard always have something to
  // show). Drives the "pick a username" modal in front of the first game.
  // Nullable so it can be added to an existing players table without wiping
  // rows — `drizzle-kit push` only needs a plain ADD COLUMN for a nullable
  // column, whereas a NOT NULL add would force a destructive table rewrite.
  usernameSet: integer("username_set", { mode: "boolean" }).default(false),
  // Test/QA escape hatch: when set, every game is unlocked for this player
  // forever (see `?testMode` in the home page + the subtle link in GameList).
  // Nullable for the same non-destructive `drizzle-kit push` reason as
  // `usernameSet` above — a plain ADD COLUMN rather than a table rewrite.
  testMode: integer("test_mode", { mode: "boolean" }).default(false),
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

/**
 * A generated "Prompt Golf" round. The full scenario — the brief, the criteria
 * the prompt must satisfy, and the par word count — is stored server-side so
 * scoring grades the submission against the exact criteria and the client can't
 * tamper. Created when a round is generated; read back when scored.
 */
export const promptGolfRounds = sqliteTable("prompt_golf_rounds", {
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

/**
 * A generated "Think It Through" round. The full scenario — including the
 * correct option and whether the quick snap answer was right — is stored
 * server-side so grading never trusts the client. Created when a round is
 * generated; read back when scored.
 */
export const chainOfThoughtRounds = sqliteTable("chain_of_thought_rounds", {
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

/**
 * A generated "Context Calibration" round. The full scenario — including each
 * candidate snippet's `kind` (essential / helpful / noise / distractor) — is
 * stored server-side so grading never trusts the client. Created when a round is
 * generated; read back when scored.
 */
export const contextCalibrationRounds = sqliteTable("context_calibration_rounds", {
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

/**
 * A generated "In the Loop" (Checkpoint Placement) round. The full scenario —
 * including each workflow step's `kind` (critical / optional / safe / trap) — is
 * stored server-side so grading never trusts the client. Created when a round is
 * generated; read back when scored.
 */
export const checkpointPlacementRounds = sqliteTable("checkpoint_placement_rounds", {
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

/**
 * A generated "Workflow Redesign Challenge" round (Act Four capstone). The full
 * scenario — including each stage's ground-truth best capability, best
 * implementation tier and governance checkpoint kind — is stored server-side so
 * grading never trusts the client. Created when a round is generated; read back
 * when scored.
 */
export const workflowRedesignRounds = sqliteTable("workflow_redesign_rounds", {
  id: text("id").primaryKey(),
  playerId: text("player_id")
    .notNull()
    .references(() => players.id),
  challengeId: text("challenge_id")
    .notNull()
    .references(() => challenges.id),
  scenarioKey: text("scenario_key").notNull().default(""),
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
export type PromptGolfRound = typeof promptGolfRounds.$inferSelect;
export type ChainOfThoughtRound = typeof chainOfThoughtRounds.$inferSelect;
export type ContextCalibrationRound = typeof contextCalibrationRounds.$inferSelect;
export type CheckpointPlacementRound = typeof checkpointPlacementRounds.$inferSelect;
export type WorkflowRedesignRound = typeof workflowRedesignRounds.$inferSelect;
