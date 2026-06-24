import chainOfThought from "./banks/chain-of-thought.json";
import checkpointPlacement from "./banks/checkpoint-placement.json";
import cleanThePipe from "./banks/clean-the-pipe.json";
import contextCalibration from "./banks/context-calibration.json";
import hallucination from "./banks/hallucination.json";
import promptGolf from "./banks/prompt-golf.json";
import rightToolForTheJob from "./banks/right-tool-for-the-job.json";
import traceFlow from "./banks/trace-flow.json";
import workflowRedesign from "./banks/workflow-redesign.json";

/**
 * Pre-generated round banks.
 *
 * Rather than calling the AI connector to invent a scenario on every play, each
 * game ships a static **bank** of pre-generated rounds and the app picks one at
 * random at runtime. The banks are produced offline by
 * `scripts/generate-round-banks.ts` (which reuses the very same generators) and
 * committed as the JSON files imported above — so play is fast, free and
 * repeatable, and live AI is only ever a fallback when a bank is empty.
 *
 * A bank file maps a **bucket key** to an array of full scenarios (ground truth
 * included — the generate routes strip it before sending to the client, exactly
 * as they do for a live scenario):
 *   - difficulty games key buckets by difficulty: `"1"`..`"5"`.
 *   - the Workflow Redesign capstone keys buckets by `scenarioKey`.
 *
 * An empty bank (`{}`) simply yields no pick, so the caller falls back to live
 * generation (or its deterministic mock). This keeps the arcade fully playable
 * before the banks have been generated.
 */

/** A game's bank: bucket key -> array of full (ground-truth-carrying) scenarios. */
export type RoundBank = Record<string, unknown[]>;

/** Canonical bank keys — one per AI-generated game. */
export type BankGame =
  | "prompt-golf"
  | "hallucination"
  | "chain-of-thought"
  | "context-calibration"
  | "trace-flow"
  | "clean-the-pipe"
  | "right-tool-for-the-job"
  | "checkpoint-placement"
  | "workflow-redesign";

const BANKS: Record<BankGame, RoundBank> = {
  "prompt-golf": promptGolf as RoundBank,
  hallucination: hallucination as RoundBank,
  "chain-of-thought": chainOfThought as RoundBank,
  "context-calibration": contextCalibration as RoundBank,
  "trace-flow": traceFlow as RoundBank,
  "clean-the-pipe": cleanThePipe as RoundBank,
  "right-tool-for-the-job": rightToolForTheJob as RoundBank,
  "checkpoint-placement": checkpointPlacement as RoundBank,
  "workflow-redesign": workflowRedesign as RoundBank,
};

/** How many rounds a bucket currently holds (0 if the bank/bucket is empty). */
export function bankBucketSize(game: BankGame, bucket: string | number): number {
  return BANKS[game]?.[String(bucket)]?.length ?? 0;
}

export interface PickRoundOptions<T> {
  /**
   * Topics used earlier in this play-through. A round whose `topic` matches one
   * of these (case-insensitive) is skipped so a play-through stays varied — the
   * same "no repeated theme" rule the live generator follows via `avoidTopics`.
   */
  avoidTopics?: string[];
  /** Optional extra filter (e.g. Prompt Golf's "must have a messyPrompt"). */
  predicate?: (scenario: T) => boolean;
}

/**
 * Pick a random round from a game's bank for the given bucket (difficulty, or
 * scenarioKey for the capstone), honouring `avoidTopics` and an optional
 * predicate. Returns a deep clone so callers may freely mutate it, or `null`
 * when the bank has nothing suitable (the caller then falls back to live
 * generation / its mock).
 */
export function pickRound<T extends { topic?: string }>(
  game: BankGame,
  bucket: string | number,
  opts: PickRoundOptions<T> = {},
): T | null {
  const pool = (BANKS[game]?.[String(bucket)] ?? []) as T[];
  if (pool.length === 0) return null;

  const avoid = new Set(
    (opts.avoidTopics ?? [])
      .filter(Boolean)
      .map((t) => t.toLowerCase().trim()),
  );

  const matchesPredicate = (s: T) => (opts.predicate ? opts.predicate(s) : true);
  const isFresh = (s: T) =>
    !s.topic || !avoid.has(s.topic.toLowerCase().trim());

  // Prefer rounds on an unused topic; if every match collides (small bank or
  // long play-through), fall back to any predicate-matching round.
  let candidates = pool.filter((s) => matchesPredicate(s) && isFresh(s));
  if (candidates.length === 0) {
    candidates = pool.filter(matchesPredicate);
  }
  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return structuredClone(chosen);
}
