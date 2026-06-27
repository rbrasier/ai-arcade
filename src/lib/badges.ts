/**
 * Achievement badges derived entirely from real progress — no separate badge
 * table. Every badge is computed from the player's per-game completion, best
 * score ratios, level and XP, so the "earned / total" count is always truthful.
 * Shared by the sidebar BadgesCard, the full leaderboard/badges page and the
 * global AchievementToast so they all agree on what counts as earned.
 *
 * Two kinds of badge:
 *  - **Game badges** (1–2 per game): a "clear" badge for completing the game and,
 *    for the scored games, an "ace" badge for averaging {@link ACE_RATIO}+ across
 *    its challenges.
 *  - **Combo badges**: rarer cross-game achievements, some deliberately hard
 *    (e.g. 90% on every game).
 */

/** A game counts as "aced" once the player's average best ratio hits this. */
export const ACE_RATIO = 0.9;

export type BadgeCategory = "game" | "combo";

export interface Badge {
  id: string;
  label: string;
  description: string;
  category: BadgeCategory;
  earned: boolean;
}

/** Per-game input for badge computation, one entry per playable game. */
export interface GameBadgeInput {
  slug: string;
  title: string;
  completed: boolean;
  /** Average best score ratio across the game's challenges (0..1). */
  bestRatio: number;
}

export interface BadgeStats {
  games: GameBadgeInput[];
  level: number;
  totalXp: number;
}

/**
 * Per-game badge copy, keyed by slug. `ace` is omitted for the (non-scored)
 * Foundations course, which gets a single completion badge. Any game without an
 * entry here falls back to generic copy derived from its title.
 */
const GAME_BADGE_COPY: Record<
  string,
  { clear: string; clearDesc: string; ace?: string; aceDesc?: string }
> = {
  "ai-foundations": {
    clear: "Foundations Graduate",
    clearDesc: "Finished the AI Foundations course.",
  },
  "prompt-golf": {
    clear: "Par for the Course",
    clearDesc: "Cleared every round of Prompt Golf.",
    ace: "Hole in One",
    aceDesc: "Averaged 90%+ across Prompt Golf.",
  },
  "spot-the-hallucination": {
    clear: "Fact Checker",
    clearDesc: "Cleared every round of Spot the Hallucination.",
    ace: "Truth Seeker",
    aceDesc: "Averaged 90%+ across Spot the Hallucination.",
  },
  "chain-of-thought": {
    clear: "Deep Thinker",
    clearDesc: "Cleared every round of Think It Through.",
    ace: "Reasoning Master",
    aceDesc: "Averaged 90%+ across Think It Through.",
  },
  "context-calibration": {
    clear: "Context Curator",
    clearDesc: "Cleared every round of Context Calibration.",
    ace: "Perfectly Calibrated",
    aceDesc: "Averaged 90%+ across Context Calibration.",
  },
  "trace-the-flow": {
    clear: "Flow Tracer",
    clearDesc: "Cleared every round of Trace the Flow.",
    ace: "Systems Cartographer",
    aceDesc: "Averaged 90%+ across Trace the Flow.",
  },
  "clean-the-pipe": {
    clear: "Pipe Cleaner",
    clearDesc: "Cleared every round of Clean the Pipe.",
    ace: "Master Plumber",
    aceDesc: "Averaged 90%+ across Clean the Pipe.",
  },
  "right-tool-for-the-job": {
    clear: "Right Tool",
    clearDesc: "Cleared every round of Fit for Purpose.",
    ace: "Value Engineer",
    aceDesc: "Averaged 90%+ across Fit for Purpose.",
  },
  "checkpoint-placement": {
    clear: "In the Loop",
    clearDesc: "Cleared every round of In the Loop.",
    ace: "Safety Officer",
    aceDesc: "Averaged 90%+ across In the Loop.",
  },
  "workflow-redesign": {
    clear: "Workflow Redesigner",
    clearDesc: "Completed the Workflow Redesign capstone.",
    ace: "Workflow Architect",
    aceDesc: "Averaged 90%+ across the Workflow Redesign capstone.",
  },
};

const ACT_ONE = ["prompt-golf", "spot-the-hallucination", "chain-of-thought"];
const ACT_THREE = ["trace-the-flow", "clean-the-pipe", "right-tool-for-the-job"];

export function computeBadges({ games, level, totalXp }: BadgeStats): Badge[] {
  const completedSlugs = new Set(
    games.filter((g) => g.completed).map((g) => g.slug),
  );
  const completedCount = completedSlugs.size;
  const totalGames = games.length;
  const acedCount = games.filter(
    (g) => g.completed && g.bestRatio >= ACE_RATIO,
  ).length;
  const has = (slug: string) => completedSlugs.has(slug);
  const allComplete = (slugs: string[]) =>
    slugs.every((s) => completedSlugs.has(s));

  // ---- Per-game badges (1–2 each) ----
  const gameBadges: Badge[] = [];
  for (const g of games) {
    const copy = GAME_BADGE_COPY[g.slug] ?? {
      clear: `${g.title} Cleared`,
      clearDesc: `Cleared every challenge in ${g.title}.`,
      ace: `${g.title} Ace`,
      aceDesc: `Averaged 90%+ across ${g.title}.`,
    };
    gameBadges.push({
      id: `${g.slug}-clear`,
      label: copy.clear,
      description: copy.clearDesc,
      category: "game",
      earned: g.completed,
    });
    if (copy.ace) {
      gameBadges.push({
        id: `${g.slug}-ace`,
        label: copy.ace,
        description: copy.aceDesc ?? `Averaged 90%+ across ${g.title}.`,
        category: "game",
        earned: g.completed && g.bestRatio >= ACE_RATIO,
      });
    }
  }

  // ---- Combo badges (cross-game; some deliberately hard) ----
  const comboBadges: Badge[] = [
    {
      id: "act-one-adept",
      label: "Act One Adept",
      description: "Cleared every Act One game.",
      category: "combo",
      earned: allComplete(ACT_ONE),
    },
    {
      id: "systems-thinker",
      label: "Systems Thinker",
      description: "Cleared all three Act Three games.",
      category: "combo",
      earned: allComplete(ACT_THREE),
    },
    {
      id: "halfway-hero",
      label: "Halfway Hero",
      description: "Completed at least half of the arcade.",
      category: "combo",
      earned: totalGames > 0 && completedCount >= Math.ceil(totalGames / 2),
    },
    {
      id: "sharpshooter",
      label: "Sharpshooter",
      description: "Averaged 90%+ on five different games.",
      category: "combo",
      earned: acedCount >= 5,
    },
    {
      id: "seasoned",
      label: "Seasoned",
      description: "Reached level 5 (or 1,000 XP).",
      category: "combo",
      earned: level >= 5 || totalXp >= 1000,
    },
    {
      id: "arcade-legend",
      label: "Arcade Legend",
      description: "Completed every game in the arcade.",
      category: "combo",
      earned: totalGames > 0 && completedCount === totalGames,
    },
    {
      id: "flawless",
      label: "Flawless",
      description: "Averaged 90%+ on every game in the arcade.",
      category: "combo",
      earned:
        totalGames > 0 &&
        games.every((g) => g.completed && g.bestRatio >= ACE_RATIO),
    },
  ];

  return [...gameBadges, ...comboBadges];
}

/**
 * Adapter from the canonical per-game progress rows to {@link BadgeStats}.
 * Coming-soon games (never playable, never completable) are excluded so they
 * don't count toward "all games" combos or clutter the badge wall. Kept here,
 * free of any db import, so server pages and the layout can share it.
 */
export function badgeStatsFromGames(
  games: {
    slug: string;
    title: string;
    status: string;
    bestScoreRatio: number;
    comingSoon: boolean | null;
  }[],
  level: number,
  totalXp: number,
): BadgeStats {
  return {
    games: games
      .filter((g) => !g.comingSoon)
      .map((g) => ({
        slug: g.slug,
        title: g.title,
        completed: g.status === "completed",
        bestRatio: g.bestScoreRatio,
      })),
    level,
    totalXp,
  };
}
