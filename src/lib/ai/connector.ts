import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * The single AI connector for the whole arcade. Every AI call — challenge
 * evaluation and dynamic challenge generation — routes through here.
 *
 * The underlying model is resolved from the Vercel AI SDK at call time based on
 * `AI_PROVIDER`, so swapping between Anthropic, OpenAI and Amazon Bedrock is a
 * config change with no code change. When the selected provider has no
 * credentials configured, `isConfigured()` returns false and callers fall back
 * to their deterministic mock so the arcade still runs end to end offline.
 */

export type AiProviderName = "anthropic" | "openai" | "bedrock";

/** Default model id per provider; override any of them with `AI_MODEL`. */
const DEFAULT_MODELS: Record<AiProviderName, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  // Region-scoped inference profile; override with AI_MODEL for your region.
  bedrock: "us.anthropic.claude-sonnet-4-20250514-v1:0",
};

function providerName(): AiProviderName {
  const raw = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (raw === "openai" || raw === "bedrock" || raw === "anthropic") return raw;
  return "anthropic";
}

function modelId(provider: AiProviderName): string {
  return process.env.AI_MODEL ?? DEFAULT_MODELS[provider];
}

/** Whether the currently selected provider has the credentials it needs. */
export function isConfigured(): boolean {
  switch (providerName()) {
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "bedrock":
      return Boolean(
        process.env.AWS_BEDROCK_API_KEY ||
          (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
      );
    default:
      return false;
  }
}

/** The provider name in use (for diagnostics / feedback). */
export function activeProvider(): AiProviderName {
  return providerName();
}

function resolveModel(): LanguageModel {
  const provider = providerName();
  const model = modelId(provider);

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
    case "bedrock":
      return createAmazonBedrock({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
        apiKey: process.env.AWS_BEDROCK_API_KEY,
      })(model);
    case "anthropic":
    default:
      return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(model);
  }
}

/**
 * Generate a structured object validated against a Zod schema. Used for both
 * the scoring judge and dynamic challenge generation.
 */
export async function generateJson<T>(
  schema: z.ZodType<T>,
  opts: { system: string; prompt: string; maxOutputTokens?: number },
): Promise<T> {
  const { object } = await generateObject({
    model: resolveModel(),
    schema,
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  });
  return object as T;
}

/** Plain text generation wrapper (kept for non-structured call sites). */
export async function generatePlainText(opts: {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const { text } = await generateText({
    model: resolveModel(),
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  });
  return text;
}
