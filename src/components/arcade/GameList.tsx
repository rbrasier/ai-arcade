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

  const playable = rows.filter(
    (r) => r.game.status === "available" || r.game.status === "in_progress",
  );
  const completed = rows.filter((r) => r.game.status === "completed");
  const locked = rows.filter((r) => r.game.status === "locked");

  return (
    <UsernameGate needsUsername={needsUsername}>
      <div className="flex flex-col gap-6">
        {playable.length > 0 && (
          <section>
            <div className="mb-3 flex items-baseline gap-2.5">
              <span className="font-arcade-mono text-[12px] font-bold tracking-[.07em] text-[#211f1a]">
                PLAY NOW
              </span>
              <span className="font-arcade-mono text-[12px] text-[#9a9488]">
                tuned for level {playerLevel}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {playable.map((r) => (
                <GameCard key={r.game.id} row={r} />
              ))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <div className="mb-3 flex items-baseline gap-2.5">
              <span className="font-arcade-mono text-[12px] font-bold tracking-[.07em] text-[#1f8a5b]">
                ✓ COMPLETED · {completed.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {completed.map((r) => (
                <GameCard key={r.game.id} row={r} />
              ))}
            </div>
          </section>
        )}

        {locked.length > 0 && (
          <section>
            <div className="mb-3 flex items-baseline gap-2.5">
              <span className="font-arcade-mono text-[12px] font-bold tracking-[.07em] text-[#9a9488]">
                LOCKED
              </span>
              <span className="font-arcade-mono text-[12px] text-[#b3ac9a]">
                keep leveling to unlock
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {locked.map((r) => (
                <GameCard key={r.game.id} row={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </UsernameGate>
  );
}
