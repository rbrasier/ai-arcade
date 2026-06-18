import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import type { AiProvider } from "./provider";

let provider: AiProvider | null = null;

/**
 * Returns the configured AI provider. Uses Anthropic when ANTHROPIC_API_KEY is
 * present, otherwise falls back to a deterministic mock so the arcade runs with
 * zero external dependencies during development.
 */
export function getAiProvider(): AiProvider {
  if (provider) return provider;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  provider = apiKey ? new AnthropicProvider(apiKey) : new MockProvider();
  return provider;
}

export type {
  AiProvider,
  EvaluateAttemptInput,
  EvaluateAttemptResult,
} from "./provider";
