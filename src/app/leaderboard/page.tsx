import { BadgeWall } from "@/components/arcade/BadgeWall";
import { Leaderboard } from "@/components/arcade/Leaderboard";
import { PlayerCard } from "@/components/arcade/PlayerCard";
import { TopNav } from "@/components/arcade/TopNav";
import { badgeStatsFromGames, computeBadges } from "@/lib/badges";
import { getOrCreatePlayer } from "@/lib/player";
import { getGamesWithProgress, getLeaderboard } from "@/lib/progress";
import { levelInfoForXp } from "@/lib/xp";

// Reads the player cookie, so render at request time.
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const player = await getOrCreatePlayer();

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
  const badges = computeBadges(
    badgeStatsFromGames(games, info.level, player.xp),
  );

  return (
    <main
      className="font-body flex-1 px-[30px] pt-[22px] pb-[70px] text-[#211f1a]"
      style={{
        background:
          "radial-gradient(120% 80% at 80% -10%, #f6f2e7 0%, #efeadd 55%)",
      }}
    >
      <div className="mx-auto max-w-[1240px]">
        <TopNav level={info.level} initial={initial} active="leaderboard" />

        <div className="mt-[30px] grid grid-cols-1 items-start gap-[34px] lg:grid-cols-[1fr_272px]">
          {/* ---------- MAIN ---------- */}
          <div>
            <div className="mb-6">
              <h1 className="font-display m-0 text-[40px] font-bold leading-[1.02] tracking-[-0.02em]">
                Leaderboard &amp; badges
              </h1>
              <p className="mt-2 max-w-[560px] text-[16px] leading-[1.45] text-[#7c766a]">
                See where you rank and the badges you&apos;ve collected. Clear
                games, ace them at 90%+ and chase the cross-game achievements.
              </p>
            </div>

            <BadgeWall badges={badges} />
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
            <Leaderboard week={week} all={all} currentPlayerId={player.id} />
          </aside>
        </div>
      </div>
    </main>
  );
}
