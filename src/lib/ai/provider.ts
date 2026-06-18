import type { Challenge, Game } from "@/lib/db/schema";

export interface EvaluateAttemptInput {
  game: Pick<Game, "slug" | "title">;
  challenge: Pick<Challenge, "title" | "prompt" | "maxScore" | "config">;
  /** The raw player response to evaluate. */
  response: string;
}

export interface EvaluateAttemptResult {
  /** Score from 0..challenge.maxScore. */
  score: number;
  /** Short, player-facing feedback explaining the score. */
  feedback: string;
  /** Whether the answer was exceptional and deserves bonus XP. */
  exceptional: boolean;
}

/**
 * The arcade talks to its AI engine exclusively through this interface so the
 * underlying provider (Anthropic today) can be swapped without touching game
 * logic.
 */
export interface AiProvider {
  readonly name: string;
  evaluateAttempt(input: EvaluateAttemptInput): Promise<EvaluateAttemptResult>;
}
