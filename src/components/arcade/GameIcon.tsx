/**
 * A small rotating set of geometric glyphs, picked deterministically by index
 * so each game gets a stable icon without needing icon data in the DB.
 */
export function GameIcon({
  index,
  stroke,
  accent,
}: {
  index: number;
  stroke: string;
  accent: string;
}) {
  const i = ((index % 6) + 6) % 6;
  const sw = 2.4;

  switch (i) {
    case 0: // magnifier
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="6.5" stroke={stroke} strokeWidth={sw} />
          <line x1="16" y1="16" x2="21" y2="21" stroke={accent} strokeWidth={3} strokeLinecap="round" />
        </svg>
      );
    case 1: // square
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="5" width="14" height="14" rx="2" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case 2: // diamond + dot
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="6" y="6" width="12" height="12" transform="rotate(45 12 12)" stroke={stroke} strokeWidth={sw} />
          <circle cx="12" cy="12" r="1.6" fill={accent} />
        </svg>
      );
    case 3: // plus
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <line x1="12" y1="4" x2="12" y2="20" stroke={stroke} strokeWidth={3} strokeLinecap="round" />
          <line x1="4" y1="12" x2="20" y2="12" stroke={stroke} strokeWidth={3} strokeLinecap="round" />
        </svg>
      );
    case 4: // peak / flame
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <polygon points="12,3 20.5,20 3.5,20" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" fill="none" />
          <polygon points="12,11 16,20 8,20" fill={accent} />
        </svg>
      );
    default: // linked rings
      return (
        <svg width="26" height="18" viewBox="0 0 34 20" fill="none">
          <circle cx="11" cy="10" r="6.5" stroke={stroke} strokeWidth={3} />
          <circle cx="23" cy="10" r="6.5" stroke={stroke} strokeWidth={3} />
        </svg>
      );
  }
}
