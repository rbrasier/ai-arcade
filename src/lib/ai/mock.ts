import type {
  AiProvider,
  EvaluateAttemptInput,
  EvaluateAttemptResult,
} from "./provider";

/**
 * Offline fallback used when no ANTHROPIC_API_KEY is configured. It produces a
 * deterministic, plausible score from the response so the whole arcade runs
 * end-to-end without any external dependency.
 */
export class MockProvider implements AiProvider {
  readonly name = "mock";

  async evaluateAttempt(
    input: EvaluateAttemptInput,
  ): Promise<EvaluateAttemptResult> {
    const { challenge, response } = input;
    const trimmed = response.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;

    // Reward an answer that exists and is reasonably substantial, then taper
    // off for very long answers (concise is good in Prompt Golf, for example).
    const lengthScore = Math.min(1, words / 25);
    const concisionBonus = words > 0 && words <= 40 ? 0.15 : 0;
    const ratio = Math.min(1, lengthScore + concisionBonus);
    const score = Math.round(challenge.maxScore * (words === 0 ? 0 : 0.5 + ratio * 0.5));

    const exceptional = words >= 8 && words <= 30;

    return {
      score,
      feedback: exceptional
        ? "Sharp and concise — strong answer! (mock evaluator)"
        : words === 0
          ? "No answer submitted. (mock evaluator)"
          : "Solid attempt. Add a real ANTHROPIC_API_KEY for richer feedback. (mock evaluator)",
      exceptional,
    };
  }
}
