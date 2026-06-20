import { redirect } from "next/navigation";

import { BadgesCard } from "@/components/arcade/BadgesCard";
import { GameList } from "@/components/arcade/GameList";
import { Leaderboard } from "@/components/arcade/Leaderboard";
import { PlayerCard } from "@/components/arcade/PlayerCard";
import { TopNav } from "@/components/arcade/TopNav";
import { UnlockToast } from "@/components/arcade/UnlockToast";
import { enableTestMode, getOrCreatePlayer } from "@/lib/player";
import { getGamesWithProgress, getLeaderboard } from "@/lib/progress";
import { levelInfoForXp } from "@/lib/xp";

// Reads the player cookie, so render at request time.
export const dynamic = "force-dynamic";

export default async function ArcadePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const player = await getOrCreatePlayer();

  // `?testMode` permanently unlocks every game for this player (QA/testing
  // escape hatch). Flip the flag, then redirect to a clean URL so the param
  // doesn't linger in the address bar or get re-applied on refresh.
  if ("testMode" in (await searchParams)) {
    enableTestMode(player.id);
    redirect("/");
  }

  const games = getGamesWithProgress(player.id);
  const week = getLeaderboard("week");
  const all = getLeaderboard("all");

  const info = levelInfoForXp(player.xp);
  const challengesCleared = games.reduce(
    (sum, g) => sum + g.clearedChallenges,
    0,
  );
  const gamesCompleted = games.filter((g) => g.status === "completed").length;
  const initial = player.displayName.trim().charAt(0).toUpperCase() || "Y";

  return (
    <main
      className="font-body flex-1 px-[30px] pt-[22px] pb-[70px] text-[#211f1a]"
      style={{
        background:
          "radial-gradient(120% 80% at 80% -10%, #f6f2e7 0%, #efeadd 55%)",
      }}
    >
      <div className="mx-auto max-w-[1240px]">
        <TopNav level={info.level} initial={initial} />

        <div className="mt-[30px] grid grid-cols-1 items-start gap-[34px] lg:grid-cols-[1fr_272px]">
          {/* ---------- MAIN ---------- */}
          <div>
            <div className="mb-6">
              <h1 className="font-display m-0 text-[40px] font-bold leading-[1.02] tracking-[-0.02em]">
                Train your AI instincts.
              </h1>
              <p className="mt-2 max-w-[560px] text-[16px] leading-[1.45] text-[#7c766a]">
                Short games that build the judgment to work with AI well. Each is
                tuned to a level range — clear your range to climb, and new games
                unlock as you level up.
              </p>
            </div>

            <GameList
              games={games}
              playerLevel={info.level}
              needsUsername={!player.usernameSet}
            />
          </div>

          {/* ---------- SIDEBAR ---------- */}
          <aside className="flex flex-col gap-3.5">
            <PlayerCard
              displayName={player.displayName}
              info={info}
              totalXp={player.xp}
              challengesCleared={challengesCleared}
              gamesCompleted={gamesCompleted}
            />
            <BadgesCard
              challengesCleared={challengesCleared}
              gamesCompleted={gamesCompleted}
              totalGames={games.length}
              level={info.level}
              totalXp={player.xp}
            />
            <Leaderboard week={week} all={all} currentPlayerId={player.id} />
          </aside>
        </div>
      </div>

      <UnlockToast
        games={games.map((g) => ({
          slug: g.slug,
          title: g.title,
          locked: g.status === "locked",
        }))}
      />
    </main>
  );
}
