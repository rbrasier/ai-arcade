import { GameList } from "@/components/arcade/GameList";
import { Leaderboard } from "@/components/arcade/Leaderboard";
import { LevelCard } from "@/components/arcade/LevelCard";
import { getOrCreatePlayer } from "@/lib/player";
import { getGamesWithProgress, getLeaderboard } from "@/lib/progress";

// Reads the player cookie, so render at request time.
export const dynamic = "force-dynamic";

export default async function ArcadePage() {
  const player = await getOrCreatePlayer();
  const games = getGamesWithProgress(player.id);
  const week = getLeaderboard("week");
  const all = getLeaderboard("all");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">AI Arcade</h1>
        <p className="mt-1 text-black/60 dark:text-white/60">
          Learn how to work with AI by playing. Pick a game and start earning XP.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        {/* Primary: game list */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
            Mini-games
          </h2>
          <GameList games={games} />
        </section>

        {/* Secondary: level + leaderboard */}
        <aside className="flex flex-col gap-4">
          <LevelCard player={player} />
          <Leaderboard week={week} all={all} currentPlayerId={player.id} />
        </aside>
      </div>
    </main>
  );
}
