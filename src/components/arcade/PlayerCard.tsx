import type { LevelInfo } from "@/lib/xp";

/** A light flavor title derived from the player's level. */
function rankTitle(level: number): string {
  if (level >= 7) return "AI Whisperer";
  if (level >= 5) return "Signal Reader";
  if (level >= 3) return "Verification Apprentice";
  return "Curious Novice";
}

export interface PlayerStat {
  value: string;
  label: string;
}

export function PlayerCard({
  displayName,
  info,
  totalXp,
  challengesCleared,
  gamesCompleted,
  wide = false,
  stats,
}: {
  displayName: string;
  info: LevelInfo;
  totalXp: number;
  challengesCleared: number;
  gamesCompleted: number;
  /** Full-width horizontal layout for the leaderboard page header. */
  wide?: boolean;
  /** Stat tiles to show (wide layout). Defaults to the sidebar's three. */
  stats?: PlayerStat[];
}) {
  const pct = Math.round(info.progress * 100);
  const initial = displayName.trim().charAt(0).toUpperCase() || "Y";
  const tiles: PlayerStat[] = stats ?? [
    { value: totalXp.toLocaleString(), label: "XP" },
    { value: String(challengesCleared), label: "cleared" },
    { value: String(gamesCompleted), label: "games" },
  ];

  // Shared "softened XP tile" look: a warm dark gradient with a faint border
  // and gentle lift, so it reads as the hero panel without harsh contrast.
  const shell =
    "rounded-2xl border border-white/[.07] text-[#f4f0e6] shadow-[0_18px_34px_-22px_rgba(40,34,22,.7)]";
  const bg = {
    background: "linear-gradient(155deg, #322d24 0%, #3c372c 100%)",
  } as const;

  if (wide) {
    return (
      <div className={`${shell} px-6 py-[18px]`} style={bg}>
        <div className="flex flex-wrap items-center gap-x-9 gap-y-4">
          {/* Identity */}
          <div className="flex items-center gap-[13px]">
            <div
              className="flex h-[46px] w-[46px] items-center justify-center rounded-full font-display text-[18px] font-bold"
              style={{ background: "linear-gradient(135deg,#564f3e,#6f6750)" }}
            >
              {initial}
            </div>
            <div>
              <div className="text-[18px] font-bold leading-tight">
                {displayName}
              </div>
              <div className="text-[12px] text-[#b3ab97]">
                {rankTitle(info.level)}
              </div>
            </div>
          </div>

          {/* Level progress */}
          <div className="min-w-[200px] flex-1">
            <div className="mb-[5px] flex items-baseline justify-between font-arcade-mono text-[11px]">
              <span className="text-[#d3cbb6]">LVL {info.level}</span>
              <span className="text-[#9b9480]">
                {info.xpIntoLevel} / {info.xpForLevel} XP
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-full bg-white/[.12]">
              <div
                className="h-full rounded-full bg-[#ec5a3a] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-start gap-x-7 gap-y-3">
            {tiles.map((t) => (
              <Stat key={t.label} value={t.value} label={t.label} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shell} px-[17px] py-4`} style={bg}>
      <div className="flex items-center gap-[11px]">
        <div
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full font-display text-[15px] font-bold"
          style={{ background: "linear-gradient(135deg,#564f3e,#6f6750)" }}
        >
          {initial}
        </div>
        <div>
          <div className="text-[15px] font-bold">{displayName}</div>
          <div className="text-[12px] text-[#b3ab97]">{rankTitle(info.level)}</div>
        </div>
      </div>

      <div className="mt-3.5">
        <div className="mb-[5px] flex items-baseline justify-between font-arcade-mono text-[11px]">
          <span className="text-[#d3cbb6]">LVL {info.level}</span>
          <span className="text-[#9b9480]">
            {info.xpIntoLevel} / {info.xpForLevel} XP
          </span>
        </div>
        <div className="h-[7px] overflow-hidden rounded-full bg-white/[.12]">
          <div
            className="h-full rounded-full bg-[#ec5a3a] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-[15px] grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <Stat key={t.label} value={t.value} label={t.label} />
        ))}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-arcade-mono text-[18px] font-bold">{value}</div>
      <div className="text-[10px] tracking-[.02em] text-[#a39c89]">{label}</div>
    </div>
  );
}
