/**
 * The sidebar badges panel. Badge state is computed from real progress by the
 * shared `computeBadges` helper (see src/lib/badges.ts), so the "earned / total"
 * count here always matches the global achievement toast.
 */

import { computeBadges } from "@/lib/badges";

export function BadgesCard({
  challengesCleared,
  gamesCompleted,
  totalGames,
  level,
  totalXp,
}: {
  challengesCleared: number;
  gamesCompleted: number;
  totalGames: number;
  level: number;
  totalXp: number;
}) {
  const badges = computeBadges({
    challengesCleared,
    gamesCompleted,
    totalGames,
    level,
    totalXp,
  });
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="rounded-2xl border border-[#ece5d4] bg-[#fbf8f0] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-[16px] font-bold m-0">Badges</h3>
        <span className="font-arcade-mono text-[11px] text-[#9a9488]">
          {earnedCount} / {badges.length}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {badges.map((b) => (
          <div
            key={b.id}
            title={b.label}
            className="flex flex-col items-center gap-[5px] text-center"
          >
            <div
              className="flex aspect-square w-full items-center justify-center rounded-[10px]"
              style={
                b.earned
                  ? {
                      background: "rgba(236,90,58,.12)",
                      border: "1px solid rgba(236,90,58,.30)",
                    }
                  : {
                      background: "#f1ecdf",
                      border: "1px dashed #d8d1bf",
                    }
              }
            >
              {b.earned ? <BadgeGlyph id={b.id} /> : <LockGlyph />}
            </div>
            <div
              className={`text-[9.5px] leading-[1.1] ${
                b.earned ? "text-[#6a655b]" : "text-[#b3ac9a]"
              }`}
            >
              {b.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const STROKE = "#211f1a";
const ACCENT = "#ec5a3a";

function BadgeGlyph({ id }: { id: string }) {
  switch (id) {
    case "first-clear":
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9.5" stroke={STROKE} strokeWidth="2.4" />
          <polygon points="9.5,7.5 16.5,12 9.5,16.5" fill={STROKE} />
        </svg>
      );
    case "on-a-roll":
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <polygon points="12,3 20.5,20 3.5,20" stroke={STROKE} strokeWidth="2.4" strokeLinejoin="round" fill="none" />
          <polygon points="12,11 16,20 8,20" fill={ACCENT} />
        </svg>
      );
    case "clearer":
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={STROKE} strokeWidth="2.4" />
          <path d="M8 12.5 L11 15.5 L16.5 9" stroke={ACCENT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "halfway":
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={STROKE} strokeWidth="2.4" />
          <path d="M12 3 a9 9 0 0 1 0 18 Z" fill={ACCENT} />
        </svg>
      );
    case "veteran":
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="7.5" stroke={STROKE} strokeWidth="2.4" />
          <line x1="12" y1="1.5" x2="12" y2="5" stroke={STROKE} strokeWidth="2.4" strokeLinecap="round" />
          <line x1="12" y1="19" x2="12" y2="22.5" stroke={STROKE} strokeWidth="2.4" strokeLinecap="round" />
          <line x1="1.5" y1="12" x2="5" y2="12" stroke={STROKE} strokeWidth="2.4" strokeLinecap="round" />
          <line x1="19" y1="12" x2="22.5" y2="12" stroke={STROKE} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    default: // completionist
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <rect x="6" y="6" width="12" height="12" transform="rotate(45 12 12)" stroke={STROKE} strokeWidth="2.4" />
          <circle cx="12" cy="12" r="1.6" fill={ACCENT} />
        </svg>
      );
  }
}

function LockGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="9" rx="1.6" stroke="#bdb6a4" strokeWidth="2.4" />
      <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" stroke="#bdb6a4" strokeWidth="2.4" fill="none" />
    </svg>
  );
}
