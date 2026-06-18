import type { LevelInfo } from "@/lib/xp";

export function XpProgress({ info }: { info: LevelInfo }) {
  const pct = Math.round(info.progress * 100);
  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-black/60 dark:text-white/60">
        {info.xpIntoLevel} / {info.xpForLevel} XP &middot; {info.xpToNext} to
        level {info.level + 1}
      </p>
    </div>
  );
}
