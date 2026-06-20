/**
 * Achievement badges derived entirely from real progress — no separate badge
 * table. Each milestone is computed from the player's cleared challenges,
 * completed games, level and XP, so the "earned / total" count is always
 * truthful. Shared by the sidebar BadgesCard and the global AchievementToast so
 * both agree on what counts as earned.
 */

export interface Badge {
  id: string;
  label: string;
  earned: boolean;
}

export interface BadgeStats {
  challengesCleared: number;
  gamesCompleted: number;
  totalGames: number;
  level: number;
  totalXp: number;
}

export function computeBadges({
  challengesCleared,
  gamesCompleted,
  totalGames,
  level,
  totalXp,
}: BadgeStats): Badge[] {
  return [
    { id: "first-clear", label: "First Clear", earned: challengesCleared >= 1 },
    { id: "on-a-roll", label: "On a Roll", earned: challengesCleared >= 5 },
    { id: "clearer", label: "Game Clearer", earned: gamesCompleted >= 1 },
    {
      id: "halfway",
      label: "Halfway",
      earned: totalGames > 0 && gamesCompleted >= Math.ceil(totalGames / 2),
    },
    { id: "veteran", label: "Veteran", earned: level >= 5 || totalXp >= 1000 },
    {
      id: "completionist",
      label: "Completionist",
      earned: totalGames > 0 && gamesCompleted >= totalGames,
    },
  ];
}
