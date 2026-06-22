import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "./client";
import {
  attempts,
  chainOfThoughtRounds,
  challenges,
  checkpointPlacementRounds,
  contextCalibrationRounds,
  games,
  hallucinationRounds,
  players,
  promptGolfRounds,
  workflowRedesignRounds,
} from "./schema";

/**
 * Seeds the arcade with the games from the learning arc
 * (see docs/LEARNING-OUTCOMES.md). Only games and their challenges are
 * seeded — no demo players. Player rows are created lazily per visitor in
 * `getOrCreatePlayer`, so the leaderboard fills in as real people play.
 *
 * Run with: `npm run db:seed` (destructive reset, for local dev) or
 * `npm run db:seed -- --if-empty` (only seeds when the arcade is empty, so it
 * is safe to run on every production/Railway deploy without wiping player
 * progress on the persistent volume).
 */

interface SeedChallenge {
  title: string;
  prompt: string;
  config?: Record<string, unknown>;
  maxScore?: number;
  xpReward?: number;
}

interface SeedGame {
  slug: string;
  title: string;
  description: string;
  estMinutes: number;
  act?: string;
  /** Listed in the arcade but not yet playable — clicking through 404s. */
  comingSoon?: boolean;
  challenges: SeedChallenge[];
}

// Ordered to follow the learning progression: Act One → Act Five. The home
// page derives each game's difficulty band from this order.
const GAMES: SeedGame[] = [
  // ===== Act Zero: Orientation =====
  // An introductory, self-paced course that runs before the first game. It is
  // not AI-scored: simply reaching the end of the eight interactive slides marks
  // it complete at 100% (see src/app/api/games/foundations/complete/route.ts),
  // which clears it and — via the standard "always keep the next games
  // available" unlock rule — unlocks Spot the Hallucination.
  {
    slug: "ai-foundations",
    act: "Act Zero — Orientation",
    title: "AI Foundations",
    description:
      "Start here. A short, hands-on tour of how AI actually works — prediction, tokens, hallucinations, context and staying in charge. Finish it to unlock the games.",
    estMinutes: 15,
    challenges: [
      {
        title: "AI Foundations — Interactive Course",
        prompt:
          "Work through all eight slides. Reaching the end completes the course.",
        config: { kind: "course" },
      },
    ],
  },

  // ===== Act One: Prompt Mastery & Safety Foundations =====
  {
    slug: "prompt-golf",
    act: "Act One — Prompt Mastery & Safety Foundations",
    title: "Prompt Golf",
    description:
      "Given a real corporate scenario, write the shortest prompt that hits every criterion without losing intent. Five rounds, each one tighter. Every word counts.",
    estMinutes: 15,
    // Five rounds of escalating difficulty. Each round's scenario — the brief,
    // the criteria the prompt must satisfy, and the par word count — is
    // generated live by the AI connector at play time (see
    // src/lib/ai/prompt-golf.ts); these rows just anchor progress/XP and carry
    // the difficulty.
    challenges: [
      {
        title: "Round 1 — Warm-up",
        prompt: "Write the shortest prompt that meets every criterion.",
        config: { difficulty: 1 },
      },
      {
        title: "Round 2 — Trim the Draft",
        prompt:
          "Rewrite the colleague's bloated draft prompt as concisely as possible without dropping a criterion.",
        config: { difficulty: 2, mode: "rewrite" },
      },
      {
        title: "Round 3 — Tighten the Brief",
        prompt: "Write the shortest prompt that meets every criterion.",
        config: { difficulty: 3 },
      },
      {
        title: "Round 4 — Plain & Precise",
        prompt: "Write the shortest prompt that meets every criterion.",
        config: { difficulty: 4 },
      },
      {
        title: "Round 5 — Boss Round",
        prompt: "Write the shortest prompt that meets every criterion.",
        config: { difficulty: 5 },
      },
    ],
  },
  {
    slug: "spot-the-hallucination",
    act: "Act One — Prompt Mastery & Safety Foundations",
    title: "Spot the Hallucination",
    description:
      "Review an AI work assistant's answer and flag the fabricated claims. Five rounds, each one harder. Trust nothing; verify everything.",
    estMinutes: 15,
    // Five rounds of escalating difficulty. Each round's scenario is generated
    // live by the AI connector at play time (see src/lib/ai/hallucination.ts);
    // these rows just anchor progress/XP and carry the difficulty.
    challenges: [
      {
        title: "Round 1 — Warm-up",
        prompt: "Tap any claim in the assistant's answer that looks fabricated.",
        config: { difficulty: 1 },
      },
      {
        title: "Round 2 — Names & Sources",
        prompt: "Tap any claim in the assistant's answer that looks fabricated.",
        config: { difficulty: 2 },
      },
      {
        title: "Round 3 — Phantom Citation",
        prompt: "Tap any claim in the assistant's answer that looks fabricated.",
        config: { difficulty: 3 },
      },
      {
        title: "Round 4 — Buried Clues",
        prompt: "Tap any claim in the assistant's answer that looks fabricated.",
        config: { difficulty: 4 },
      },
      {
        title: "Round 5 — Boss Round",
        prompt: "Tap any claim in the assistant's answer that looks fabricated.",
        config: { difficulty: 5 },
      },
    ],
  },

  // A bridge between Act One and Act Two: now that players can prompt and spot
  // fabrications, "Think It Through" teaches the mindset shift that AI can
  // *reason through* the multi-step work they used to do by hand — and that
  // their job moves to directing and verifying that reasoning. Five rounds of
  // escalating difficulty, generated live by the AI connector (see
  // src/lib/ai/chain-of-thought.ts); these rows anchor progress/XP and carry
  // the difficulty.
  {
    slug: "chain-of-thought",
    act: "Act One — Prompt Mastery & Safety Foundations",
    title: "Think It Through",
    description:
      "A quick AI blurts a confident answer to a multi-step task. Decide whether to trust it or make it reason the work out step by step — then commit the final call. Five rounds, each one harder.",
    estMinutes: 15,
    challenges: [
      {
        title: "Round 1 — Warm-up",
        prompt: "Trust the quick answer or make it think — then commit the final answer.",
        config: { difficulty: 1 },
      },
      {
        title: "Round 2 — Two Steps",
        prompt: "Trust the quick answer or make it think — then commit the final answer.",
        config: { difficulty: 2 },
      },
      {
        title: "Round 3 — Mind the Trap",
        prompt: "Trust the quick answer or make it think — then commit the final answer.",
        config: { difficulty: 3 },
      },
      {
        title: "Round 4 — Layered Rules",
        prompt: "Trust the quick answer or make it think — then commit the final answer.",
        config: { difficulty: 4 },
      },
      {
        title: "Round 5 — Boss Round",
        prompt: "Trust the quick answer or make it think — then commit the final answer.",
        config: { difficulty: 5 },
      },
    ],
  },

  // ===== Act Two: Context Mastery =====
  {
    slug: "context-calibration",
    act: "Act Two — Context Mastery",
    title: "Context Calibration",
    description:
      "Each round, a colleague sends a task and a tray of candidate context snippets. Attach only what the answer needs — too little starves it, too much misdirects it — then see what the AI produces. Five rounds, each one harder.",
    estMinutes: 15,
    challenges: [
      {
        title: "Round 1 — Cut Through the Noise",
        prompt: "Attach only the context the answer needs, then run it.",
        config: { difficulty: 1 },
      },
      {
        title: "Round 2 — Mind the Stale Detail",
        prompt: "Attach only the context the answer needs, then run it.",
        config: { difficulty: 2 },
      },
      {
        title: "Round 3 — Spot the Distractor",
        prompt: "Attach only the context the answer needs, then run it.",
        config: { difficulty: 3 },
      },
      {
        title: "Round 4 — Resist the Pile-On",
        prompt: "Attach only the context the answer needs, then run it.",
        config: { difficulty: 4 },
      },
      {
        title: "Round 5 — Boss Round",
        prompt: "Attach only the context the answer needs, then run it.",
        config: { difficulty: 5 },
      },
    ],
  },

  // ===== Act Three: Seeing Work as a System =====
  // Designed in docs/LEARNING-OUTCOMES.md but not yet implemented: these three
  // games are seeded so they appear in the arcade list, but they have no play
  // routes yet (clicking through 404s) and no per-round generators/tables. The
  // challenge rows just anchor progress/XP and carry the difficulty, matching
  // the five-round escalating pattern the rest of the arcade uses.
  {
    slug: "trace-the-flow",
    act: "Act Three — Seeing Work as a System",
    title: "Trace the Flow",
    description:
      "A messy, real-world account of how a task actually gets done. Rebuild it into an ordered chain of steps, tag each input and output, and spot the broken hand-offs. Five rounds — you can't redesign what you can't see.",
    estMinutes: 15,
    comingSoon: true,
    challenges: [
      {
        title: "Round 1 — Warm-up",
        prompt: "Put the steps in order and tag each one's input and output.",
        config: { difficulty: 1 },
      },
      {
        title: "Round 2 — Mind the Hand-off",
        prompt: "Order the steps and flag the broken link where information gets lost.",
        config: { difficulty: 2 },
      },
      {
        title: "Round 3 — Reformatted in Transit",
        prompt: "Order the steps and flag the broken link where information gets lost.",
        config: { difficulty: 3 },
      },
      {
        title: "Round 4 — Parallel Branch",
        prompt: "Order the steps, including the branch that runs alongside the main chain.",
        config: { difficulty: 4 },
      },
      {
        title: "Round 5 — Boss Round",
        prompt: "Order the steps, including the loop-back that returns work for another pass.",
        config: { difficulty: 5 },
      },
    ],
  },
  {
    slug: "clean-the-pipe",
    act: "Act Three — Seeing Work as a System",
    title: "Clean the Pipe",
    description:
      "Before you run an AI step, triage the data going in. Catch the dirt that actually poisons the output — not all dirt is equal — then compare what the AI made from the raw vs the cleaned data. Five rounds, the input-side mirror of Spot the Hallucination.",
    estMinutes: 15,
    comingSoon: true,
    challenges: [
      {
        title: "Round 1 — Warm-up",
        prompt: "Triage the inputs, then run the step and compare the outputs.",
        config: { difficulty: 1 },
      },
      {
        title: "Round 2 — Duplicates & Blanks",
        prompt: "Triage the inputs, then run the step and compare the outputs.",
        config: { difficulty: 2 },
      },
      {
        title: "Round 3 — Stale Record",
        prompt: "Triage the inputs, then run the step and compare the outputs.",
        config: { difficulty: 3 },
      },
      {
        title: "Round 4 — Wrong Category",
        prompt: "Triage the inputs, then run the step and compare the outputs.",
        config: { difficulty: 4 },
      },
      {
        title: "Round 5 — Boss Round",
        prompt: "Triage the inputs, then run the step and compare the outputs.",
        config: { difficulty: 5 },
      },
    ],
  },
  {
    slug: "right-tool-for-the-job",
    act: "Act Three — Seeing Work as a System",
    title: "Right Tool for the Job",
    description:
      "Match each workflow step to the right intervention — leave it manual, rules, an LLM, or a custom app — and weigh the build, maintenance and failure costs against the drag of doing nothing. Five rounds scored on net value, not sophistication. Sometimes the smart move is to build nothing.",
    estMinutes: 15,
    comingSoon: true,
    challenges: [
      {
        title: "Round 1 — Warm-up",
        prompt: "Read the step's characteristics and pick the intervention with the best net value.",
        config: { difficulty: 1 },
      },
      {
        title: "Round 2 — Count the Cost",
        prompt: "Read the step's characteristics and pick the intervention with the best net value.",
        config: { difficulty: 2 },
      },
      {
        title: "Round 3 — Resist the Shiny Option",
        prompt: "Read the step's characteristics and pick the intervention with the best net value.",
        config: { difficulty: 3 },
      },
      {
        title: "Round 4 — Don't Under-Build",
        prompt: "Read the step's characteristics and pick the intervention with the best net value.",
        config: { difficulty: 4 },
      },
      {
        title: "Round 5 — Boss Round",
        prompt: "Read the step's characteristics and pick the intervention with the best net value.",
        config: { difficulty: 5 },
      },
    ],
  },

  // ===== Act Four: Safe Delegation & Human-in-the-Loop Design =====
  {
    slug: "checkpoint-placement",
    act: "Act Four — Safe Delegation",
    title: "In the Loop",
    description:
      "An AI workflow runs on its own — you decide where a human must step in. Too few checkpoints is liability; too many kills the speed. Five rounds of rising risk.",
    estMinutes: 15,
    // Five rounds of escalating risk (Low → Medium → High). Each round's
    // workflow — its steps and which ones truly need a human — is generated live
    // by the AI connector at play time (see src/lib/ai/checkpoint-placement.ts);
    // these rows just anchor progress/XP and carry the difficulty + risk tier.
    challenges: [
      {
        title: "Round 1 — Low Risk",
        prompt:
          "An internal, reversible AI workflow. Place a human checkpoint only where one genuinely earns its cost.",
        config: { difficulty: 1, risk: "low" },
      },
      {
        title: "Round 2 — Medium Risk",
        prompt:
          "Some steps now reach other people. Decide where a human must review before the AI acts.",
        config: { difficulty: 2, risk: "medium" },
      },
      {
        title: "Round 3 — Medium Risk",
        prompt:
          "Money and people are in play. Guard the steps that act, leave the internal ones to run.",
        config: { difficulty: 3, risk: "medium" },
      },
      {
        title: "Round 4 — High Risk",
        prompt:
          "Irreversible, high-stakes actions. Keep a human on every call that can't be undone — without choking the pipeline.",
        config: { difficulty: 4, risk: "high" },
      },
      {
        title: "Round 5 — Boss Round",
        prompt:
          "Life-changing decisions about real people. Put humans exactly where they must stay accountable, and nowhere they'd just rubber-stamp.",
        config: { difficulty: 5, risk: "high" },
      },
    ],
  },

  // ===== Act Five: Workflow Redesign & The Art of the Possible =====
  {
    slug: "workflow-redesign",
    act: "Act Five — Workflow Redesign",
    title: "Workflow Redesign Challenge",
    description:
      "Redesign a real corporate workflow around AI's strengths — spot the bottlenecks, rebuild with capability blocks, and validate for technical and governance risk.",
    estMinutes: 15,
    challenges: [
      {
        title: "Scenario — HR Onboarding",
        prompt:
          "Analyse the current onboarding workflow, redesign it with AI capability blocks, and choose where a custom application beats an LLM or a rules-based filter.",
        config: { scenario: "hr-onboarding" },
      },
      {
        title: "Scenario — Expense Review",
        prompt:
          "Redesign expense review for speed and defensibility. Balance automation against the human checkpoints governance requires.",
        config: { scenario: "expense-review" },
      },
    ],
  },
];

function seed() {
  // `--if-empty` makes the seed non-destructive: if the arcade already has
  // games (e.g. a persistent Railway volume carried over from a previous
  // deploy), leave the database — and all accumulated player progress —
  // untouched. The destructive reset below only runs on an explicit full seed.
  const ifEmpty = process.argv.includes("--if-empty");
  if (ifEmpty) {
    const { count } = db
      .select({ count: sql<number>`count(*)` })
      .from(games)
      .get() ?? { count: 0 };
    if (count > 0) {
      console.log(
        `Arcade already seeded (${count} games present); skipping seed.`,
      );
      return;
    }
  }

  console.log("Seeding arcade database...");

  // Clear existing rows so the script is idempotent. Attempts and players are
  // cleared too (attempts reference challenges, which are recreated with fresh
  // ids) — no demo data is inserted, so the arcade starts with games only.
  db.delete(hallucinationRounds).run();
  db.delete(promptGolfRounds).run();
  db.delete(chainOfThoughtRounds).run();
  db.delete(contextCalibrationRounds).run();
  db.delete(checkpointPlacementRounds).run();
  db.delete(workflowRedesignRounds).run();
  db.delete(attempts).run();
  db.delete(challenges).run();
  db.delete(games).run();
  db.delete(players).run();

  GAMES.forEach((game, gameIndex) => {
    const gameId = randomUUID();
    db.insert(games)
      .values({
        id: gameId,
        slug: game.slug,
        title: game.title,
        description: game.description,
        sortOrder: gameIndex,
        estMinutes: game.estMinutes,
        isActive: true,
        act: game.act ?? null,
        comingSoon: game.comingSoon ?? false,
      })
      .run();

    game.challenges.forEach((challenge, challengeIndex) => {
      db.insert(challenges)
        .values({
          id: randomUUID(),
          gameId,
          sortOrder: challengeIndex,
          title: challenge.title,
          prompt: challenge.prompt,
          config: challenge.config ?? null,
          maxScore: challenge.maxScore ?? 100,
          xpReward: challenge.xpReward ?? 100,
        })
        .run();
    });
  });

  const challengeCount = GAMES.reduce((n, g) => n + g.challenges.length, 0);
  console.log(
    `Seeded ${GAMES.length} games and ${challengeCount} challenges (no demo players).`,
  );
}

seed();
