import { BadgeWall } from "@/components/arcade/BadgeWall";
import { Leaderboard } from "@/components/arcade/Leaderboard";
import { PlayerCard, type PlayerStat } from "@/components/arcade/PlayerCard";
import { TopNav } from "@/components/arcade/TopNav";
import { badgeStatsFromGames, computeBadges } from "@/lib/badges";
import { getOrCreatePlayer } from "@/lib/player";
import { getGamesWithProgress, getLeaderboard } from "@/lib/progress";
import { levelInfoForXp } from "@/lib/xp";

// Reads the player cookie, so render at request time.
export const dynamic = "force-dynamic";

// Show a deeper board on the dedicated page than the home sidebar's top 10.
const BOARD_SIZE = 25;

export default async function LeaderboardPage() {
  const player = await getOrCreatePlayer();

  const games = getGamesWithProgress(player.id);
  const week = getLeaderboard("week", BOARD_SIZE);
  const all = getLeaderboard("all", BOARD_SIZE);

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

  // Extra derived stats for the wide hero card — all from data already loaded,
  // no new queries. Coming-soon games can't be played, so exclude them.
  const playable = games.filter((g) => !g.comingSoon);
  const gamesAced = playable.filter(
    (g) => g.status === "completed" && g.bestScoreRatio >= 0.9,
  ).length;
  const badgesEarned = badges.filter((b) => b.earned).length;
  const bestScorePct = playable.length
    ? Math.round(Math.max(...playable.map((g) => g.bestScoreRatio)) * 100)
    : 0;
  const myRank = all.find((e) => e.playerId === player.id)?.rank;

  const heroStats: PlayerStat[] = [
    { value: player.xp.toLocaleString(), label: "total XP" },
    ...(myRank ? [{ value: `#${myRank}`, label: "rank" }] : []),
    { value: String(challengesCleared), label: "cleared" },
    { value: String(gamesCompleted), label: "completed" },
    { value: String(gamesAced), label: "aced 90%+" },
    { value: `${bestScorePct}%`, label: "best score" },
    { value: `${badgesEarned}/${badges.length}`, label: "badges" },
  ];

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

        <div className="mt-[30px] mb-6">
          <h1 className="font-display m-0 text-[40px] font-bold leading-[1.02] tracking-[-0.02em]">
            Leaderboard &amp; badges
          </h1>
          <p className="mt-2 max-w-[620px] text-[16px] leading-[1.45] text-[#7c766a]">
            See where you rank and the badges you&apos;ve collected. Clear games,
            ace them at 90%+ and chase the cross-game achievements.
          </p>
        </div>

        {/* Full-width hero card across both columns. */}
        <PlayerCard
          displayName={player.displayName}
          info={info}
          totalXp={player.xp}
          challengesCleared={challengesCleared}
          gamesCompleted={gamesCompleted}
          wide
          stats={heroStats}
        />

        {/* 50/50: extended leaderboard | badges. */}
        <div className="mt-[22px] grid grid-cols-1 items-start gap-[34px] lg:grid-cols-2">
          <Leaderboard week={week} all={all} currentPlayerId={player.id} />
          <BadgeWall badges={badges} />
        </div>
      </div>
    </main>
  );
}
