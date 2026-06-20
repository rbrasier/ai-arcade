/**
 * Achievement milestones derived entirely from real progress — no separate badge
 * table. Each is computed from the player's cleared challenges, completed games,
 * level and XP, so the "earned / total" count is always truthful.
 *
 * Shared so both the sidebar `BadgesCard` and the root-layout reward toast read
 * the exact same definitions (a new badge can't be celebrated and then missing
 * from the card, or vice versa).
 */

export interface Badge {
  id: string;
  label: string;
  earned: boolean;
}

export interface BadgeInput {
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
}: BadgeInput): Badge[] {
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
