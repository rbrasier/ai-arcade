import Link from "next/link";

import type { GameWithProgress } from "@/lib/progress";

const STATUS_LABEL: Record<GameWithProgress["status"], string> = {
  available: "Available",
  in_progress: "In progress",
  completed: "Completed",
  locked: "Locked",
};

const STATUS_CLASS: Record<GameWithProgress["status"], string> = {
  available: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  in_progress: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  locked: "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50",
};

export function GameCard({ game }: { game: GameWithProgress }) {
  const locked = game.status === "locked";
  const progressPct =
    game.totalChallenges > 0
      ? Math.round((game.clearedChallenges / game.totalChallenges) * 100)
      : 0;

  const inner = (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-5 transition ${
        locked
          ? "cursor-not-allowed border-black/10 bg-black/[.02] opacity-60 dark:border-white/10 dark:bg-white/[.02]"
          : "border-black/10 bg-white hover:border-indigo-400 hover:shadow-sm dark:border-white/15 dark:bg-white/[.03] dark:hover:border-indigo-400"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">{game.title}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[game.status]}`}
        >
          {STATUS_LABEL[game.status]}
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60">
        {game.description}
      </p>
      <div className="mt-1 flex items-center gap-4 text-xs text-black/50 dark:text-white/50">
        <span>~{game.estMinutes} min</span>
        <span>
          {game.clearedChallenges}/{game.totalChallenges} challenges
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-indigo-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );

  if (locked) {
    return <div aria-disabled>{inner}</div>;
  }

  return (
    <Link href={`/games/${game.slug}`} className="block">
      {inner}
    </Link>
  );
}
