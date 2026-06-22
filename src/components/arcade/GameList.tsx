import type { GameWithProgress } from "@/lib/progress";
import { GameCard, type GameRowData } from "./GameCard";
import { UsernameGate } from "./UsernameGate";

/** Build display rows: difficulty band + icon index derived from sort order. */
function toRows(games: GameWithProgress[]): GameRowData[] {
  return games.map((game, i) => ({
    game,
    levelLo: i + 1,
    levelHi: i + 2,
    iconIndex: i,
  }));
}

function ActSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-3 pb-0.5">
      <span className="font-arcade-mono text-[10px] tracking-[.09em] text-[#b0a99b] whitespace-nowrap">
        {label.toUpperCase()}
      </span>
      <div className="flex-1 border-t border-[#e3dcca]" />
    </div>
  );
}

export function GameList({
  games,
  playerLevel,
  needsUsername = false,
}: {
  games: GameWithProgress[];
  playerLevel: number;
  /** When true, selecting a game prompts for a username before navigating. */
  needsUsername?: boolean;
}) {
  const rows = toRows(games);

  // Track the last seen act label to know when to inject a separator.
  const rowsWithSeparator = rows.map((r, i) => ({
    ...r,
    showSeparator:
      r.game.act != null &&
      (i === 0 || r.game.act !== rows[i - 1].game.act),
  }));

  // Render the whole ladder in its natural order (sort order). Cleared games
  // stay in their original position — still filled out as completed — rather
  // than being pulled into a separate section below the games you can play now.
  return (
    <UsernameGate needsUsername={needsUsername}>
      <section>
        <div className="mb-3 flex items-baseline gap-2.5">
          <span className="font-arcade-mono text-[12px] font-bold tracking-[.07em] text-[#211f1a]">
            YOUR LADDER
          </span>
          <span className="font-arcade-mono text-[12px] text-[#9a9488]">
            tuned for level {playerLevel}
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          {rowsWithSeparator.map((r) => (
            <div key={r.game.id}>
              {r.showSeparator && r.game.act && (
                <ActSeparator label={r.game.act} />
              )}
              <GameCard row={r} />
            </div>
          ))}
        </div>

        {/* Subtle QA escape hatch: unlocks every game forever for this player.
            Deliberately low-contrast and unobtrusive — easy to miss unless you
            know it's here. */}
        <div className="mt-4 text-center">
          <a
            href="/?testMode"
            className="font-arcade-mono text-[10px] tracking-[.06em] text-[#d4cfc5] transition-colors hover:text-[#b8b2a8]"
          >
            Test Mode
          </a>
        </div>
      </section>
    </UsernameGate>
  );
}
