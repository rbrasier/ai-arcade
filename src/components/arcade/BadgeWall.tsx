/**
 * The full badge collection, grouped into game badges and cross-game
 * achievements. Used on the leaderboard page to show every badge the player has
 * earned (and the ones still to chase), with each badge's description visible.
 */

import type { Badge } from "@/lib/badges";
import { BadgeArt } from "@/components/arcade/BadgeGlyphs";

export function BadgeWall({ badges }: { badges: Badge[] }) {
  const earnedCount = badges.filter((b) => b.earned).length;
  const gameBadges = badges.filter((b) => b.category === "game");
  const comboBadges = badges.filter((b) => b.category === "combo");

  return (
    <div className="rounded-[20px] border border-[#ece5d4] bg-[#fbf8f0] p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="font-display text-[22px] font-bold m-0">Badges</h2>
        <span className="font-arcade-mono text-[12px] text-[#9a9488]">
          {earnedCount} / {badges.length} earned
        </span>
      </div>

      <BadgeSection title="Achievements" badges={comboBadges} />
      <div className="mt-6">
        <BadgeSection title="Per-game" badges={gameBadges} />
      </div>
    </div>
  );
}

function BadgeSection({ title, badges }: { title: string; badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <div>
      <h3 className="font-arcade-mono mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-[#9a9488]">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {badges.map((b) => (
          <BadgeRow key={b.id} badge={b} />
        ))}
      </div>
    </div>
  );
}

function BadgeRow({ badge }: { badge: Badge }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[12px] px-3 py-2.5"
      style={
        badge.earned
          ? {
              background: "rgba(236,90,58,.07)",
              border: "1px solid rgba(236,90,58,.22)",
            }
          : {
              background: "#f4efe3",
              border: "1px dashed #ddd6c4",
            }
      }
    >
      <div
        className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px]"
        style={
          badge.earned
            ? {
                background: "rgba(236,90,58,.14)",
                border: "1px solid rgba(236,90,58,.30)",
              }
            : { background: "#ece6d6", border: "1px dashed #d8d1bf" }
        }
      >
        <BadgeArt
          id={badge.id}
          category={badge.category}
          earned={badge.earned}
          size={24}
        />
      </div>
      <div className="min-w-0">
        <div
          className={`text-[14px] font-bold leading-tight ${
            badge.earned ? "text-[#211f1a]" : "text-[#a39c8a]"
          }`}
        >
          {badge.label}
        </div>
        <div
          className={`text-[12px] leading-snug ${
            badge.earned ? "text-[#7c766a]" : "text-[#b3ac9a]"
          }`}
        >
          {badge.description}
        </div>
      </div>
    </div>
  );
}
