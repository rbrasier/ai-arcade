import Link from "next/link";

import type { GameWithProgress } from "@/lib/progress";
import { GameIcon } from "./GameIcon";

const ACCENT = "#ec5a3a";

export interface GameRowData {
  game: GameWithProgress;
  /** Display-only difficulty band derived from sort order. */
  levelLo: number;
  levelHi: number;
  iconIndex: number;
}

export function GameCard({ row }: { row: GameRowData }) {
  const { game, levelLo, levelHi, iconIndex } = row;
  const clearedPct =
    game.totalChallenges > 0
      ? Math.round((game.clearedChallenges / game.totalChallenges) * 100)
      : 0;

  // ---- Locked -------------------------------------------------------------
  if (game.status === "locked") {
    return (
      <div
        className="gcard flex items-center gap-4 rounded-[14px] border border-dashed border-[#d8d1bf] bg-[#f6f1e6] px-[18px] py-[14px]"
        aria-disabled
      >
        <IconTile tone="muted" index={iconIndex} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="font-display text-[18px] font-bold tracking-[-0.01em] text-[#9a9488] m-0">
              {game.title}
            </h3>
            <LevelChip lo={levelLo} hi={levelHi} tone="muted" />
          </div>
          <p className="mt-[3px] text-[13.5px] leading-[1.35] text-[#a8a191]">
            {game.description}
          </p>
        </div>
        <div className="flex flex-none items-center gap-[7px] font-arcade-mono text-[12px] whitespace-nowrap text-[#9a9488]">
          <LockGlyph />
          LVL {levelLo}
        </div>
      </div>
    );
  }

  // ---- Completed ----------------------------------------------------------
  if (game.status === "completed") {
    return (
      <Link
        href={`/games/${game.slug}`}
        className="gcard flex items-center gap-4 rounded-[14px] border border-[#e7e0cf] bg-[#f6f1e6] px-[18px] py-[14px] opacity-[.82]"
      >
        <IconTile tone="muted" index={iconIndex} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="font-display text-[18px] font-bold tracking-[-0.01em] text-[#5c574d] m-0">
              {game.title}
            </h3>
            <LevelChip lo={levelLo} hi={levelHi} tone="muted" />
          </div>
          <p className="mt-[3px] text-[13.5px] leading-[1.35] text-[#8a8478]">
            {game.description}
          </p>
        </div>
        <div className="flex-none font-arcade-mono text-[12px] whitespace-nowrap text-[#1f8a5b]">
          ✓ Cleared{" "}
          <span className="text-[#9a9488]">· {clearedPct}%</span>
        </div>
      </Link>
    );
  }

  // ---- Playable (available / in progress) --------------------------------
  const started = game.clearedChallenges > 0 || game.xpEarned > 0;
  return (
    <Link
      href={`/games/${game.slug}`}
      className="gcard flex items-center gap-4 rounded-[14px] border border-[#ece5d4] bg-[#fffdf7] px-[18px] py-[14px] shadow-[0_6px_18px_-14px_rgba(40,34,22,.3)]"
    >
      <IconTile tone="accent" index={iconIndex} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h3 className="font-display text-[18px] font-bold tracking-[-0.012em] m-0">
            {game.title}
          </h3>
          <LevelChip lo={levelLo} hi={levelHi} tone="accent" />
        </div>
        <p className="mt-[3px] text-[13.5px] leading-[1.35] text-[#7c766a]">
          {game.description}
        </p>
      </div>
      <div className="flex flex-none items-center gap-4">
        {started ? (
          <div className="font-arcade-mono text-[12px] whitespace-nowrap text-[#6a655b]">
            <span className="text-[#211f1a]">★ {game.xpEarned}</span> ·{" "}
            {clearedPct}%
          </div>
        ) : (
          <div className="font-arcade-mono text-[12px] font-bold tracking-[.04em] text-[#1f8a5b]">
            NEW
          </div>
        )}
        <span className="playbtn inline-flex items-center gap-[7px] rounded-[9px] bg-[#ec5a3a] px-[15px] py-2 font-arcade-mono text-[11px] font-bold tracking-[.05em] whitespace-nowrap text-white">
          ▶ PLAY
        </span>
      </div>
    </Link>
  );
}

function IconTile({
  tone,
  index,
}: {
  tone: "accent" | "muted";
  index: number;
}) {
  if (tone === "muted") {
    return (
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] border border-[#e3dcca] bg-[#efe9db]">
        <GameIcon index={index} stroke="#8a857a" accent="#8a857a" />
      </div>
    );
  }
  return (
    <div
      className="flex h-11 w-11 flex-none items-center justify-center rounded-[11px]"
      style={{
        background: "linear-gradient(150deg, rgba(236,90,58,.18), #fff)",
        border: "1px solid rgba(236,90,58,.26)",
      }}
    >
      <GameIcon index={index} stroke="#211f1a" accent={ACCENT} />
    </div>
  );
}

function LevelChip({
  lo,
  hi,
  tone,
}: {
  lo: number;
  hi: number;
  tone: "accent" | "muted";
}) {
  if (tone === "muted") {
    return (
      <span className="rounded-md bg-[#efe9db] px-[7px] py-[3px] font-arcade-mono text-[10px] font-bold tracking-[.06em] whitespace-nowrap text-[#9a9488]">
        LVL {lo}–{hi}
      </span>
    );
  }
  return (
    <span
      className="rounded-md px-[7px] py-[3px] font-arcade-mono text-[10px] font-bold tracking-[.06em] whitespace-nowrap text-[#ec5a3a]"
      style={{ background: "rgba(236,90,58,.12)" }}
    >
      LVL {lo}–{hi}
    </span>
  );
}

function LockGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="#9a9488" strokeWidth="2.4" />
      <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" stroke="#9a9488" strokeWidth="2.4" fill="none" />
    </svg>
  );
}
