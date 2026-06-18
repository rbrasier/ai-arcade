import Anthropic from "@anthropic-ai/sdk";

import type {
  AiProvider,
  EvaluateAttemptInput,
  EvaluateAttemptResult,
} from "./provider";

/**
 * Model choices. Haiku is fast and cheap for quick scoring; bump to Sonnet for
 * richer, more nuanced evaluation by setting ARCADE_EVAL_MODEL.
 */
const DEFAULT_MODEL = process.env.ARCADE_EVAL_MODEL ?? "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are the judge for an educational AI arcade that teaches people how to work with AI.
You score a player's answer to a challenge. Be fair but encouraging.
Respond with ONLY a JSON object of the form:
{"score": <integer 0..maxScore>, "feedback": "<one or two sentences>", "exceptional": <boolean>}
Mark "exceptional" true only for genuinely outstanding, creative, or insightful answers.`;

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async evaluateAttempt(
    input: EvaluateAttemptInput,
  ): Promise<EvaluateAttemptResult> {
    const { game, challenge, response } = input;

    const userContent = [
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

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return parseEvaluation(text, challenge.maxScore);
  }
}

/** Best-effort parse of the model's JSON response, clamped to valid ranges. */
function parseEvaluation(
  text: string,
  maxScore: number,
): EvaluateAttemptResult {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    const score = Math.max(
      0,
      Math.min(maxScore, Math.round(Number(parsed.score) || 0)),
    );
    return {
      score,
      feedback: String(parsed.feedback ?? "Evaluated."),
      exceptional: Boolean(parsed.exceptional),
    };
  } catch {
    return {
      score: Math.round(maxScore * 0.5),
      feedback: "We couldn't fully parse the evaluation, so here's a default score.",
      exceptional: false,
    };
  }
}
