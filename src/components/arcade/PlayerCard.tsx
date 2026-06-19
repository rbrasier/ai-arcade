import type { LevelInfo } from "@/lib/xp";

/** A light flavor title derived from the player's level. */
function rankTitle(level: number): string {
  if (level >= 7) return "AI Whisperer";
  if (level >= 5) return "Signal Reader";
  if (level >= 3) return "Verification Apprentice";
  return "Curious Novice";
}

export function PlayerCard({
  displayName,
  info,
  totalXp,
  challengesCleared,
  gamesCompleted,
}: {
  displayName: string;
  info: LevelInfo;
  totalXp: number;
  challengesCleared: number;
  gamesCompleted: number;
}) {
  const pct = Math.round(info.progress * 100);
  const initial = displayName.trim().charAt(0).toUpperCase() || "Y";

  return (
    // Softened "XP tile": rather than the stark flat near-black panel, this uses
    // a warm dark gradient with a faint border and a gentle lift so it still
    // reads as the hero of the sidebar without the harsh contrast.
    <div
      className="rounded-2xl border border-white/[.07] px-[17px] py-4 text-[#f4f0e6] shadow-[0_18px_34px_-22px_rgba(40,34,22,.7)]"
      style={{ background: "linear-gradient(155deg, #322d24 0%, #3c372c 100%)" }}
    >
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
        <Stat value={totalXp.toLocaleString()} label="XP" />
        <Stat value={String(challengesCleared)} label="cleared" />
        <Stat value={String(gamesCompleted)} label="games" />
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
