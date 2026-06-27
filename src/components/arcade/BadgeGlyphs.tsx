/**
 * Shared badge artwork. A small set of glyphs keyed off the badge's kind so the
 * sidebar card and the full badge wall stay visually consistent without a bespoke
 * icon per badge: combo badges get a trophy, per-game "ace" badges a star,
 * other game badges a medal, and unearned badges a padlock.
 */

import type { BadgeCategory } from "@/lib/badges";

const STROKE = "#211f1a";
const ACCENT = "#ec5a3a";

export function BadgeArt({
  id,
  category,
  earned,
  size = 21,
}: {
  id: string;
  category: BadgeCategory;
  earned: boolean;
  size?: number;
}) {
  if (!earned) return <LockGlyph size={size} />;
  if (category === "combo") return <TrophyGlyph size={size} />;
  if (id.endsWith("-ace")) return <StarGlyph size={size} />;
  return <MedalGlyph size={size} />;
}

function MedalGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="6.5" stroke={STROKE} strokeWidth="2.2" />
      <path
        d="M9 13.5 L11.3 15.8 L15.2 11"
        stroke={ACCENT}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M8.5 6.5 L6 2 M15.5 6.5 L18 2"
        stroke={STROKE}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3 L14.6 9.1 L21 9.6 L16.2 13.9 L17.6 20.2 L12 16.9 L6.4 20.2 L7.8 13.9 L3 9.6 L9.4 9.1 Z"
        fill={ACCENT}
        stroke={STROKE}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrophyGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M7 4 H17 V9 a5 5 0 0 1 -10 0 Z"
        stroke={STROKE}
        strokeWidth="2.2"
        strokeLinejoin="round"
        fill="rgba(236,90,58,.18)"
      />
      <path
        d="M7 5 H4 V6.5 a3 3 0 0 0 3 3 M17 5 H20 V6.5 a3 3 0 0 1 -3 3"
        stroke={STROKE}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M12 14 V17 M9 20 H15 M10 20 a2 3 0 0 1 4 0"
        stroke={STROKE}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect
        x="5"
        y="11"
        width="14"
        height="9"
        rx="1.6"
        stroke="#bdb6a4"
        strokeWidth="2.4"
      />
      <path
        d="M8 11 V8 a4 4 0 0 1 8 0 V11"
        stroke="#bdb6a4"
        strokeWidth="2.4"
        fill="none"
      />
    </svg>
  );
}
