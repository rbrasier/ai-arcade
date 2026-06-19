/**
 * XP and level math for the arcade.
 *
 * Levels use a gently increasing curve: each level costs a bit more XP than the
 * last. This keeps early progress fast (so new players feel momentum) while
 * stretching out the higher levels.
 */

/** XP required to advance *from* the given level to the next one. */
export function xpToAdvanceFromLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

export interface LevelInfo {
  level: number;
  /** XP accumulated within the current level. */
  xpIntoLevel: number;
  /** Total XP needed to clear the current level. */
  xpForLevel: number;
  /** XP still required to reach the next level. */
  xpToNext: number;
  /** Progress through the current level, 0..1. */
  progress: number;
}

/** Resolve a total XP value into level + progress details. */
export function levelInfoForXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));

  while (remaining >= xpToAdvanceFromLevel(level)) {
    remaining -= xpToAdvanceFromLevel(level);
    level += 1;
  }

  const xpForLevel = xpToAdvanceFromLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForLevel,
    xpToNext: xpForLevel - remaining,
    progress: xpForLevel === 0 ? 0 : remaining / xpForLevel,
  };
}

/** Convenience helper that returns just the level for a total XP value. */
export function levelForXp(totalXp: number): number {
  return levelInfoForXp(totalXp).level;
}

/**
 * Common XP-bonus rule shared by every game (see docs/GAME-RULES.md).
 *
 * Bonus XP is layered on top of base XP based on how well the player did:
 *   - score ratio ≥ 0.85  → big bonus  (0.5× of the challenge's xpReward)
 *   - score ratio ≥ 0.70  → bonus      (0.25× of the challenge's xpReward)
 *   - below 0.70          → no bonus
 */
export const BONUS_TIER_BIG = 0.85;
export const BONUS_TIER_SMALL = 0.7;

export function bonusForScoreRatio(
  xpReward: number,
  scoreRatio: number,
): number {
  if (scoreRatio >= BONUS_TIER_BIG) return Math.round(xpReward * 0.5);
  if (scoreRatio >= BONUS_TIER_SMALL) return Math.round(xpReward * 0.25);
  return 0;
}
