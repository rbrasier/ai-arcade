import { randomUUID } from "node:crypto";

import { db } from "./client";
import { attempts, challenges, games, players } from "./schema";

/**
 * Seeds the arcade with 5 games (~2 hours of play), sample challenges for the
 * first two, and a few demo players so the leaderboard renders immediately.
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

const GAMES: SeedGame[] = [
  {
    slug: "prompt-golf",
    title: "Prompt Golf",
    description:
      "Hit the target output with the fewest, cleanest words. Par is low — every token counts.",
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
      "Read AI-generated passages and flag the fabricated claims. Trust nothing; verify everything.",
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
  {
    slug: "few-shot-architect",
    title: "Few-Shot Architect",
    description:
      "Design example sets that steer the model. Pick the examples that teach the pattern fastest. (Coming soon)",
    estMinutes: 24,
    challenges: [
      {
        title: "Challenge 1 — Classify the Tone",
        prompt:
          "Provide three examples that teach a model to classify customer messages as happy, neutral, or angry.",
      },
    ],
  },
  {
    slug: "chain-of-thought",
    title: "Chain of Thought",
    description:
      "Guide the model's reasoning step by step to solve tricky problems it would otherwise botch. (Coming soon)",
    estMinutes: 24,
    challenges: [
      {
        title: "Challenge 1 — The Word Problem",
        prompt:
          "Write a prompt that makes the model reason step-by-step through a multi-step arithmetic word problem.",
      },
    ],
  },
  {
    slug: "eval-designer",
    title: "Eval Designer",
    description:
      "Build the rubric. Define what 'good' looks like and write checks that catch bad answers. (Coming soon)",
    estMinutes: 24,
    challenges: [
      {
        title: "Challenge 1 — Grade a Summary",
        prompt:
          "Design a 3-criteria rubric for scoring an AI-generated summary and explain each criterion.",
      },
    ],
  },
];

const DEMO_PLAYERS = [
  { displayName: "Vector Voyager 4821", xp: 1240 },
  { displayName: "Prompt Pilot 2207", xp: 860 },
  { displayName: "Token Tinkerer 9043", xp: 410 },
  { displayName: "Neon Novice 1188", xp: 120 },
];

function seed() {
  console.log("Seeding arcade database...");

  // Clear existing rows so the script is idempotent.
  db.delete(attempts).run();
  db.delete(challenges).run();
  db.delete(games).run();
  db.delete(players).run();

  const challengeIds: string[] = [];

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
      const challengeId = randomUUID();
      challengeIds.push(challengeId);
      db.insert(challenges)
        .values({
          id: challengeId,
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

  const now = new Date();
  DEMO_PLAYERS.forEach((p) => {
    const playerId = randomUUID();
    db.insert(players)
      .values({
        id: playerId,
        displayName: p.displayName,
        xp: p.xp,
        level: 1,
        createdAt: now,
      })
      .run();

    // Give each demo player a recent attempt so the weekly leaderboard renders.
    db.insert(attempts)
      .values({
        id: randomUUID(),
        playerId,
        challengeId: challengeIds[0],
        score: 80,
        xpEarned: Math.round(p.xp * 0.4),
        bonusXp: 0,
        response: "(seeded demo attempt)",
        evaluation: { score: 80, feedback: "Seeded demo attempt.", exceptional: false },
        createdAt: now,
      })
      .run();
  });

  console.log(
    `Seeded ${GAMES.length} games and ${DEMO_PLAYERS.length} demo players.`,
  );
}

seed();
