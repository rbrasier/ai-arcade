import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, type LanguageModel } from "ai";
import { z } from "zod";

const execFileAsync = promisify(execFile);

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

export type AiProviderName = "anthropic" | "openai" | "bedrock" | "claude-cli";

/**
 * The `claude-cli` provider shells out to the locally installed, authenticated
 * `claude` Code CLI instead of calling a provider API directly. It needs no API
 * key, which makes it handy for **offline bank generation** (`npm run
 * rounds:generate`) from a machine that has Claude Code logged in. It is not
 * intended for the deployed web app's request path.
 */
function usingClaudeCli(): boolean {
  return (process.env.AI_PROVIDER ?? "").toLowerCase() === "claude-cli";
}

/** Model id for CLI generation (override with AI_MODEL). */
const DEFAULT_CLI_MODEL = "claude-sonnet-4-6";

/** Pull the first balanced JSON object/array out of a CLI text response. */
function extractJson(text: string): unknown {
  let s = text.trim();
  // Strip a ```json … ``` (or plain ```) fence if the model added one.
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in CLI response");
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) {
      return JSON.parse(s.slice(start, i + 1));
    }
  }
  throw new Error("Unbalanced JSON in CLI response");
}

/**
 * Run a one-shot generation through the `claude` CLI in print mode. `--system-
 * prompt` replaces the default agent prompt so it behaves as a pure generator,
 * and the cwd is neutral so it doesn't load this project's CLAUDE.md as context.
 */
async function runClaudeCli(opts: {
  system: string;
  prompt: string;
}): Promise<string> {
  const model = process.env.AI_MODEL ?? DEFAULT_CLI_MODEL;
  const { stdout } = await execFileAsync(
    "claude",
    [
      "-p",
      opts.prompt,
      "--model",
      model,
      "--system-prompt",
      opts.system,
      "--output-format",
      "text",
    ],
    {
      cwd: process.env.CLAUDE_CLI_CWD || tmpdir(),
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180_000,
    },
  );
  return stdout;
}

/** Default model id per provider; override any of them with `AI_MODEL`. */
const DEFAULT_MODELS: Record<AiProviderName, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  // Region-scoped inference profile; override with AI_MODEL for your region.
  bedrock: "us.anthropic.claude-sonnet-4-20250514-v1:0",
  // Resolved separately in runClaudeCli (DEFAULT_CLI_MODEL); listed for type
  // completeness only.
  "claude-cli": DEFAULT_CLI_MODEL,
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
  if (usingClaudeCli()) return true;
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
  if (usingClaudeCli()) {
    // The CLI has no schema-guided decoding, so spell out the exact shape
    // (field names included) as JSON Schema, or the model invents key names.
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
    const instruction = `\n\nReturn ONLY a single JSON value — no prose, no explanation, no markdown code fences — that strictly conforms to this JSON Schema (use these exact field names):\n${jsonSchema}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const text = await runClaudeCli({
        system: opts.system,
        prompt: opts.prompt + instruction,
      });
      try {
        return schema.parse(extractJson(text));
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }
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
  if (usingClaudeCli()) {
    return runClaudeCli({ system: opts.system, prompt: opts.prompt });
  }
  const { text } = await generateText({
    model: resolveModel(),
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  });
  return text;
}
