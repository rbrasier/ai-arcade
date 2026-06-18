import { levelInfoForXp } from "@/lib/xp";
import type { Player } from "@/lib/db/schema";
import { XpProgress } from "./XpProgress";

export function LevelCard({ player }: { player: Player }) {
  const info = levelInfoForXp(player.xp);

  return (
    <section className="rounded-xl border border-black/10 bg-black/[.02] p-4 dark:border-white/10 dark:bg-white/[.02]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
            {player.displayName}
          </p>
          <p className="text-2xl font-semibold">Level {info.level}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10 text-lg font-bold text-indigo-500">
          {info.level}
        </div>
      </div>
      <div className="mt-3">
        <XpProgress info={info} />
      </div>
    </section>
  );
}
