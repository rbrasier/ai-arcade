import { z } from "zod";

import { generateJson, isConfigured } from "./connector";
import { MockProvider } from "./mock";
import type {
  AiProvider,
  EvaluateAttemptInput,
  EvaluateAttemptResult,
} from "./provider";

const SYSTEM_PROMPT = `You are the judge for an educational AI arcade that teaches people how to work with AI.
You score a player's answer to a challenge. Be fair but encouraging.
Mark "exceptional" true only for genuinely outstanding, creative, or insightful answers.`;

const evaluationSchema = z.object({
  score: z.number().describe("Integer score from 0 to maxScore."),
  feedback: z.string().describe("One or two sentences of player-facing feedback."),
  exceptional: z
    .boolean()
    .describe("True only for genuinely outstanding answers."),
});

/**
 * Connector-backed evaluator. Uses whichever provider is configured via the
 * single AI connector (Anthropic / OpenAI / Bedrock). Falls back to the
 * deterministic mock when no provider credentials are present.
 */
export class ConnectorEvaluator implements AiProvider {
  readonly name = "connector";
  private mock = new MockProvider();

  async evaluateAttempt(
    input: EvaluateAttemptInput,
  ): Promise<EvaluateAttemptResult> {
    if (!isConfigured()) {
      return this.mock.evaluateAttempt(input);
    }

    const { game, challenge, response } = input;
    const prompt = [
      `Game: ${game.title} (${game.slug})`,
      `Challenge: ${challenge.title}`,
      `Instructions to the player: ${challenge.prompt}`,
      `maxScore: ${challenge.maxScore}`,
      challenge.config
        ? `Challenge config: ${JSON.stringify(challenge.config)}`
        : null,
      `\nPlayer's answer:\n${response}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const result = await generateJson(evaluationSchema, {
        system: SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 512,
      });
      const score = Math.max(
        0,
        Math.min(challenge.maxScore, Math.round(Number(result.score) || 0)),
      );
      return {
        score,
        feedback: String(result.feedback ?? "Evaluated."),
        exceptional: Boolean(result.exceptional),
      };
    } catch {
      // Network / provider failure — degrade gracefully to the mock score.
      return this.mock.evaluateAttempt(input);
    }
  }
}
