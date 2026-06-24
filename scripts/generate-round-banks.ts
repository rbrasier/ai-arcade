/**
 * Pre-generate the static round banks the arcade picks from at runtime.
 *
 * Rather than calling the AI connector on every play, each AI-generated game
 * ships a committed bank of pre-made rounds (`src/lib/rounds/banks/<game>.json`)
 * and the app selects one at random (see `src/lib/rounds/bank.ts`). This script
 * fills those banks by calling the very same generators the app uses — with
 * `fromBank: false` so it always produces *fresh* scenarios instead of reading
 * the bank it is writing.
 *
 * Usage:
 *   AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run rounds:generate
 *   npm run rounds:generate -- --count=200            # 200 per game
 *   npm run rounds:generate -- --game=prompt-golf     # one game only
 *   ROUNDS_PER_GAME=50 npm run rounds:generate         # via env
 *
 * The count is the target *per game*, split evenly across that game's buckets
 * (difficulty 1-5, or the two capstone scenarios). It defaults to 150 (→ 30 per
 * difficulty). Requires a configured AI provider — otherwise every call would
 * return the same deterministic mock and the bank would collapse to one round
 * per bucket.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { activeProvider, isConfigured } from "@/lib/ai/connector";
import { generateChainOfThoughtRound } from "@/lib/ai/chain-of-thought";
import { generateCheckpointPlacementRound } from "@/lib/ai/checkpoint-placement";
import { generateCleanThePipeRound } from "@/lib/ai/clean-the-pipe";
import { generateContextCalibrationRound } from "@/lib/ai/context-calibration";
import { generateHallucinationRound } from "@/lib/ai/hallucination";
import { generatePromptGolfRound } from "@/lib/ai/prompt-golf";
import { generateRightToolRound } from "@/lib/ai/right-tool-for-the-job";
import { generateTraceFlowRound } from "@/lib/ai/trace-flow";
import { generateWorkflowRedesignRound } from "@/lib/ai/workflow-redesign";

/** Minimal shape the script needs; concrete scenario types are assignable. */
interface Scenario {
  topic?: string;
}

interface GameSpec {
  /** Bank key — must match the key used in `src/lib/rounds/bank.ts`. */
  game: string;
  /** Bucket keys for this game (difficulties, or capstone scenario keys). */
  buckets: string[];
  /** Generate one fresh scenario for a bucket, biased away from used topics. */
  generate: (bucket: string, avoidTopics: string[]) => Promise<Scenario>;
}

const DIFFICULTIES = ["1", "2", "3", "4", "5"];

const GAMES: GameSpec[] = [
  {
    game: "prompt-golf",
    buckets: DIFFICULTIES,
    // Generate every entry as a rewrite round so it carries a `messyPrompt`
    // draft; the runtime strips it on normal (non-rewrite) rounds.
    generate: (b, avoid) =>
      generatePromptGolfRound(Number(b), {
        rewrite: true,
        avoidTopics: avoid,
        fromBank: false,
      }),
  },
  {
    game: "hallucination",
    buckets: DIFFICULTIES,
    generate: (b, avoid) =>
      generateHallucinationRound(Number(b), { avoidTopics: avoid, fromBank: false }),
  },
  {
    game: "chain-of-thought",
    buckets: DIFFICULTIES,
    generate: (b, avoid) =>
      generateChainOfThoughtRound(Number(b), { avoidTopics: avoid, fromBank: false }),
  },
  {
    game: "context-calibration",
    buckets: DIFFICULTIES,
    generate: (b, avoid) =>
      generateContextCalibrationRound(Number(b), {
        avoidTopics: avoid,
        fromBank: false,
      }),
  },
  {
    game: "trace-flow",
    buckets: DIFFICULTIES,
    generate: (b, avoid) =>
      generateTraceFlowRound(Number(b), { avoidTopics: avoid, fromBank: false }),
  },
  {
    game: "clean-the-pipe",
    buckets: DIFFICULTIES,
    generate: (b, avoid) =>
      generateCleanThePipeRound(Number(b), { avoidTopics: avoid, fromBank: false }),
  },
  {
    game: "right-tool-for-the-job",
    buckets: DIFFICULTIES,
    generate: (b, avoid) =>
      generateRightToolRound(Number(b), { avoidTopics: avoid, fromBank: false }),
  },
  {
    game: "checkpoint-placement",
    buckets: DIFFICULTIES,
    generate: (b, avoid) =>
      generateCheckpointPlacementRound(Number(b), {
        avoidTopics: avoid,
        fromBank: false,
      }),
  },
  {
    game: "workflow-redesign",
    buckets: ["hr-onboarding", "expense-review"],
    generate: (b, avoid) =>
      generateWorkflowRedesignRound(b, { avoidTopics: avoid, fromBank: false }),
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  let count = Number(process.env.ROUNDS_PER_GAME ?? 150);
  let concurrency = Number(process.env.CONCURRENCY ?? 6);
  let games: string[] | null = null;
  for (const arg of args) {
    const [k, v] = arg.replace(/^--/, "").split("=");
    if (k === "count" && v) count = Number(v);
    if (k === "concurrency" && v) concurrency = Number(v);
    if (k === "game" && v) games = v.split(",").map((s) => s.trim());
  }
  if (!Number.isFinite(count) || count <= 0) count = 150;
  if (!Number.isFinite(concurrency) || concurrency <= 0) concurrency = 6;
  return { count, concurrency, games };
}

const BANKS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "rounds",
  "banks",
);

/** Topics to surface to the model: the most recent ones, to keep prompts small. */
const AVOID_WINDOW = 40;

function bankFile(game: string) {
  return join(BANKS_DIR, `${game}.json`);
}

function loadBank(game: string): Record<string, Scenario[]> {
  const file = bankFile(game);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveBank(game: string, bank: Record<string, Scenario[]>) {
  writeFileSync(bankFile(game), `${JSON.stringify(bank, null, 2)}\n`);
}

const topicOf = (s: Scenario) => (s.topic ?? "").toLowerCase().trim();

/** Run async tasks with a fixed concurrency, draining the queue as slots free. */
async function runPool(tasks: (() => Promise<void>)[], concurrency: number) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    async () => {
      while (next < tasks.length) {
        const i = next++;
        await tasks[i]();
      }
    },
  );
  await Promise.all(workers);
}

async function main() {
  const { count, concurrency, games } = parseArgs();

  if (!isConfigured()) {
    console.error(
      `\n✗ No AI provider configured (provider="${activeProvider()}").\n` +
        `  Set AI_PROVIDER and its credentials before generating, e.g.:\n` +
        `    AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... npm run rounds:generate\n` +
        `    AI_PROVIDER=claude-cli npm run rounds:generate   # uses the local Claude Code CLI\n` +
        `  Generating against the deterministic mock would collapse each bank to\n` +
        `  one round per bucket, so this script refuses to run offline.\n`,
    );
    process.exit(1);
  }

  const selected = games ? GAMES.filter((g) => games.includes(g.game)) : GAMES;
  if (selected.length === 0) {
    console.error(`No matching games for --game=${games?.join(",")}`);
    process.exit(1);
  }

  mkdirSync(BANKS_DIR, { recursive: true });
  console.log(
    `Generating up to ${count} rounds/game via "${activeProvider()}" ` +
      `(${selected.length} game(s), concurrency ${concurrency})…\n` +
      `Banks are written incrementally and reruns resume, so progress is never lost.\n`,
  );

  for (const spec of selected) {
    const perBucket = Math.max(1, Math.round(count / spec.buckets.length));
    // Resume: keep whatever is already banked and only generate the shortfall.
    const bank = loadBank(spec.game);
    for (const b of spec.buckets) bank[b] = bank[b] ?? [];

    let done = 0;
    let failed = 0;
    const target = spec.buckets.reduce(
      (n, b) => n + Math.max(0, perBucket - bank[b].length),
      0,
    );
    if (target === 0) {
      console.log(`  ✓ ${spec.game}: already at target, skipping.`);
      continue;
    }

    const tasks: (() => Promise<void>)[] = [];
    for (const bucket of spec.buckets) {
      const need = Math.max(0, perBucket - bank[bucket].length);
      for (let i = 0; i < need; i++) {
        tasks.push(async () => {
          // Snapshot the bucket's topics now to bias toward variety (best-effort
          // under concurrency — the runtime de-dups within a play-through too).
          const avoid = bank[bucket].map(topicOf).filter(Boolean).slice(-AVOID_WINDOW);
          try {
            const scenario = await spec.generate(bucket, avoid);
            bank[bucket].push(scenario);
            saveBank(spec.game, bank); // incremental — safe to interrupt
          } catch (err) {
            failed++;
            console.error(
              `\n  ! ${spec.game}[${bucket}] failed: ${(err as Error).message?.slice(0, 140)}`,
            );
          } finally {
            done++;
            process.stdout.write(
              `\r  ${spec.game}: ${done}/${target} generated (${failed} failed)   `,
            );
          }
        });
      }
    }

    await runPool(tasks, concurrency);
    const total = Object.values(bank).reduce((n, r) => n + r.length, 0);
    process.stdout.write("\n");
    console.log(`  ✓ ${spec.game}: ${total} rounds total → ${bankFile(spec.game)}\n`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
