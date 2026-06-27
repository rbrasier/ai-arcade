/**
 * The sidebar badges panel. Badges are computed from real progress by the shared
 * `computeBadges` helper (see src/lib/badges.ts) and passed in, so the
 * "earned / total" count always matches the global achievement toast and the
 * full badge wall on the leaderboard page.
 *
 * The card shows at most two rows (10 cells), earned badges first; when there
 * are more than fit, a link points to the leaderboard page where every badge is
 * shown.
 */

import Link from "next/link";

import type { Badge } from "@/lib/badges";
import { BadgeArt } from "@/components/arcade/BadgeGlyphs";

const VISIBLE = 10; // two rows of five

export function BadgesCard({ badges }: { badges: Badge[] }) {
  const earnedCount = badges.filter((b) => b.earned).length;
  // Earned first so the player always sees what they've unlocked within the two
  // visible rows; the rest live on the leaderboard page.
  const ordered = [...badges].sort(
    (a, b) => Number(b.earned) - Number(a.earned),
  );
  const shown = ordered.slice(0, VISIBLE);
  const hasMore = badges.length > VISIBLE;

  return (
    <div className="rounded-2xl border border-[#ece5d4] bg-[#fbf8f0] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-[16px] font-bold m-0">Badges</h3>
        <span className="font-arcade-mono text-[11px] text-[#9a9488]">
          {earnedCount} / {badges.length}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {shown.map((b) => (
          <div
            key={b.id}
            title={`${b.label}${b.earned ? "" : " (locked)"} — ${b.description}`}
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
              <BadgeArt id={b.id} category={b.category} earned={b.earned} />
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
      {hasMore && (
        <Link
          href="/leaderboard"
          className="font-arcade-mono mt-3 flex items-center justify-center gap-1 text-[11px] font-bold tracking-[.04em] text-[#ec5a3a] hover:underline"
        >
          VIEW ALL BADGES →
        </Link>
      )}
    </div>
  );
}
