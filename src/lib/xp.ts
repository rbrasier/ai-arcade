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
