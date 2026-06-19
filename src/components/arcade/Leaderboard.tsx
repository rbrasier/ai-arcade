"use client";

import { useState } from "react";

import type { LeaderboardEntry } from "@/lib/progress";

type Range = "week" | "all";

const AVATAR_COLORS = [
  "#ec5a3a",
  "#3a6ea5",
  "#1f8a5b",
  "#8a5bb0",
  "#c9912a",
  "#4a4536",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function Leaderboard({
  week,
  all,
  currentPlayerId,
}: {
  week: LeaderboardEntry[];
  all: LeaderboardEntry[];
  currentPlayerId: string;
}) {
  const [range, setRange] = useState<Range>("week");
  const entries = range === "week" ? week : all;

  return (
    <div className="rounded-[20px] border border-[#ece5d4] bg-[#fbf8f0] p-5">
      <div className="mb-3.5 flex items-baseline justify-between">
        <h3 className="font-display text-[18px] font-bold m-0">Leaderboard</h3>
        <div className="flex rounded-lg bg-[#efe9da] p-0.5 font-arcade-mono text-[10px]">
          <ToggleButton active={range === "week"} onClick={() => setRange("week")}>
            THIS WEEK
          </ToggleButton>
          <ToggleButton active={range === "all"} onClick={() => setRange("all")}>
            ALL TIME
          </ToggleButton>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-[#9a9488]">
          No scores yet — be the first!
        </p>
      ) : (
        <div>
          {entries.map((entry) => {
            const isCurrent = entry.playerId === currentPlayerId;
            return (
              <div
                key={entry.playerId}
                className="flex items-center gap-[11px] rounded-[10px] px-2.5 py-2"
                style={
                  isCurrent
                    ? { background: "rgba(236,90,58,.10)", margin: "0 -10px" }
                    : undefined
                }
              >
                <span className="w-[22px] font-arcade-mono text-[13px] text-[#9a9488]">
                  #{entry.rank}
                </span>
                <div
                  className="h-[26px] w-[26px] flex-none rounded-full"
                  style={{ background: avatarColor(entry.playerId) }}
                />
                <span
                  className={`flex-1 truncate text-[14px] ${
                    isCurrent ? "font-bold" : "font-medium"
                  }`}
                >
                  {entry.displayName}
                  {isCurrent ? " (you)" : ""}
                </span>
                <span className="font-arcade-mono text-[14px] font-bold tabular-nums">
                  {entry.xp.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 font-bold tracking-[.04em] transition ${
        active ? "bg-white text-[#211f1a] shadow-sm" : "text-[#9a9488]"
      }`}
    >
      {children}
    </button>
  );
}
