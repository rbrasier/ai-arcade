import type { GameWithProgress } from "@/lib/progress";
import { GameCard } from "./GameCard";

export function GameList({ games }: { games: GameWithProgress[] }) {
  return (
    <div className="flex flex-col gap-4">
      {games.map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </div>
  );
}
