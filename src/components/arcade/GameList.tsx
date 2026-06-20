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
          {rows.map((r) => (
            <GameCard key={r.game.id} row={r} />
          ))}
        </div>

        {/* Subtle QA escape hatch: unlocks every game forever for this player.
            Deliberately low-contrast and unobtrusive — easy to miss unless you
            know it's here. */}
        <div className="mt-4 text-right">
          <a
            href="/?testMode"
            className="font-arcade-mono text-[10px] tracking-[.06em] text-[#efeadd] transition-colors hover:text-[#c8c2b4]"
            title="Unlock all games (test mode)"
          >
            ·
          </a>
        </div>
      </section>
    </UsernameGate>
  );
}
