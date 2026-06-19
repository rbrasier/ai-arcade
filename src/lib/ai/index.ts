import { ConnectorEvaluator } from "./evaluate";
import type { AiProvider } from "./provider";

let provider: AiProvider | null = null;

/**
 * Returns the arcade's evaluation provider. All AI now routes through the
 * single connector (`src/lib/ai/connector.ts`), which selects Anthropic,
 * OpenAI or Bedrock from `AI_PROVIDER` and falls back to a deterministic mock
 * when no credentials are configured — so the arcade runs with zero external
 * dependencies during development.
 */
export function getAiProvider(): AiProvider {
  if (provider) return provider;
  provider = new ConnectorEvaluator();
  return provider;
}

export type {
  AiProvider,
  EvaluateAttemptInput,
  EvaluateAttemptResult,
} from "./provider";
