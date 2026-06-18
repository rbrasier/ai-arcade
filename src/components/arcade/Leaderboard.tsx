"use client";

import { useState } from "react";

import type { LeaderboardEntry } from "@/lib/progress";

type Range = "week" | "all";

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
    <section className="rounded-xl border border-black/10 bg-black/[.02] p-4 dark:border-white/10 dark:bg-white/[.02]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Leaderboard
        </h2>
        <div className="flex rounded-lg bg-black/5 p-0.5 text-xs dark:bg-white/10">
          <ToggleButton
            active={range === "week"}
            onClick={() => setRange("week")}
          >
            This week
          </ToggleButton>
          <ToggleButton active={range === "all"} onClick={() => setRange("all")}>
            All time
          </ToggleButton>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-black/50 dark:text-white/50">
          No scores yet — be the first!
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {entries.map((entry) => {
            const isCurrent = entry.playerId === currentPlayerId;
            return (
              <li
                key={entry.playerId}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${
                  isCurrent
                    ? "bg-indigo-500/15 font-medium text-indigo-700 dark:text-indigo-300"
                    : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-5 text-right text-black/40 dark:text-white/40">
                    {entry.rank}
                  </span>
                  <span className="truncate">
                    {entry.displayName}
                    {isCurrent ? " (you)" : ""}
                  </span>
                </span>
                <span className="tabular-nums text-black/60 dark:text-white/60">
                  {entry.xp} XP
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
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
      className={`rounded-md px-2.5 py-1 transition ${
        active
          ? "bg-white text-black shadow-sm dark:bg-white/20 dark:text-white"
          : "text-black/50 dark:text-white/50"
      }`}
    >
      {children}
    </button>
  );
}
