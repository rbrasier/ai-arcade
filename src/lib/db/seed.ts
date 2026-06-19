import { randomUUID } from "node:crypto";

import { db } from "./client";
import { attempts, challenges, games, players } from "./schema";

/**
 * Seeds the arcade with the games from the learning arc
 * (see docs/LEARNING-OUTCOMES.md). Only games and their challenges are
 * seeded — no demo players. Player rows are created lazily per visitor in
 * `getOrCreatePlayer`, so the leaderboard fills in as real people play.
 *
 * Run with: `npm run db:seed`
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
  challenges: SeedChallenge[];
}

// Ordered to follow the learning progression: Act One → Act Four. The home
// page derives each game's difficulty band from this order.
const GAMES: SeedGame[] = [
  // ===== Act One: Prompt Mastery & Safety Foundations =====
  {
    slug: "prompt-golf",
    title: "Prompt Golf",
    description:
      "Given a real corporate scenario, rewrite a messy prompt as concisely as possible without losing intent. Par is low — every token counts.",
    estMinutes: 24,
    challenges: [
      {
        title: "Hole 1 — The Summary",
        prompt:
          "Write the shortest prompt that makes an AI summarise any article into exactly three bullet points.",
        config: { par: 20, metric: "words" },
      },
      {
        title: "Hole 2 — The Translator",
        prompt:
          "Write a minimal prompt that reliably translates English to formal Japanese, preserving tone.",
        config: { par: 18, metric: "words" },
      },
      {
        title: "Hole 3 — The JSON Extractor",
        prompt:
          "Craft the leanest prompt that extracts name, email, and phone from messy text as strict JSON.",
        config: { par: 25, metric: "words" },
      },
    ],
  },
  {
    slug: "spot-the-hallucination",
    title: "Spot the Hallucination",
    description:
      "Review AI-generated passages and flag the fabricated claims. Trust nothing; verify everything.",
    estMinutes: 24,
    challenges: [
      {
        title: "Case 1 — The Confident Biography",
        prompt:
          "Identify the fabricated fact in this AI-written biography and explain why it's suspect.",
        config: {
          passage:
            "Ada Lovelace, born in 1815, is often called the first computer programmer for her notes on Babbage's Analytical Engine. In 1842 she founded the Royal Society of Computing in London.",
          hallucination: "She did not found any 'Royal Society of Computing'.",
        },
      },
      {
        title: "Case 2 — The Science Claim",
        prompt:
          "Spot the invented statistic in this paragraph and describe how you'd verify it.",
        config: {
          passage:
            "Photosynthesis converts sunlight into chemical energy. Studies show that exactly 91.4% of a leaf's surface is dedicated to this process.",
          hallucination: "The oddly precise 91.4% figure is fabricated.",
        },
      },
    ],
  },

  // ===== Act Two: Context Mastery =====
  {
    slug: "context-calibration",
    title: "Context Calibration",
    description:
      "Compose prompts with variable context and watch output quality shift. Learn where context is too sparse, too noisy, or missing entirely.",
    estMinutes: 20,
    challenges: [
      {
        title: "Round 1 — Add One Detail",
        prompt:
          "This answer went wrong because the model lacked context. Add exactly one contextual detail to the prompt that fixes the hallucination.",
        config: {
          mode: "add-context",
          weak:
            "Draft a reply approving the request. (The model invents a budget figure it was never given.)",
        },
      },
      {
        title: "Round 2 — Cut the Noise",
        prompt:
          "Remove two noisy, irrelevant sentences from this over-stuffed context so the output sharpens.",
        config: { mode: "remove-noise", removeTarget: 2 },
      },
    ],
  },

  // ===== Act Three: Safe Delegation & Human-in-the-Loop Design =====
  {
    slug: "checkpoint-placement",
    title: "Checkpoint Placement",
    description:
      "Place human-review checkpoints in an AI-redesigned workflow. Too many kills efficiency; too few creates liability — calibration wins.",
    estMinutes: 28,
    challenges: [
      {
        title: "Low Risk — Meeting Notes",
        prompt:
          "An AI auto-summarises meeting notes. Place human-review checkpoints only where they genuinely add value.",
        config: { risk: "low", scenario: "Auto-summarise meeting notes" },
      },
      {
        title: "Medium Risk — Policy Violations",
        prompt:
          "An AI flags policy violations in submissions. Decide where a human must confirm before action is taken.",
        config: { risk: "medium", scenario: "Flag policy violations in submissions" },
      },
      {
        title: "High Risk — Staffing Decisions",
        prompt:
          "An AI recommends staffing decisions from performance data. Position checkpoints so humans stay accountable for the call.",
        config: {
          risk: "high",
          scenario: "Recommend staffing decisions from performance data",
        },
      },
    ],
  },

  // ===== Act Four: Workflow Redesign & The Art of the Possible =====
  {
    slug: "workflow-redesign",
    title: "Workflow Redesign Challenge",
    description:
      "Redesign a real corporate workflow around AI's strengths — spot the bottlenecks, rebuild with capability blocks, and validate for technical and governance risk.",
    estMinutes: 35,
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
  console.log("Seeding arcade database...");

  // Clear existing rows so the script is idempotent. Attempts and players are
  // cleared too (attempts reference challenges, which are recreated with fresh
  // ids) — no demo data is inserted, so the arcade starts with games only.
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
