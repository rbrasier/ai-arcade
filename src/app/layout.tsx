import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import {
  Bricolage_Grotesque,
  Hanken_Grotesk,
  Space_Mono,
} from "next/font/google";
import "./globals.css";

import { RewardToast, type RewardBadge } from "@/components/arcade/RewardToast";
import { SiteLock } from "@/components/arcade/SiteLock";
import { computeBadges } from "@/lib/badges";
import { getOrCreatePlayer } from "@/lib/player";
import { getGamesWithProgress } from "@/lib/progress";
import {
  SITE_AUTH_COOKIE,
  cookieUnlocks,
  getSitePassword,
} from "@/lib/site-auth";
import { levelInfoForXp } from "@/lib/xp";

// Arcade Hub display + body + label fonts. Exposed as CSS variables and wired
// into Tailwind tokens (see globals.css) so the home page can opt in without
// changing the default font on the rest of the app.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: "AI Arcade",
  description: "Learn AI by playing. A scaffolded arcade of teaching mini-games.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Show the password gate when `SITE_PASSWORD` is set and this visitor hasn't
  // unlocked yet. The proxy enforces the gate on the API; this is the UI.
  const locked = getSitePassword()
    ? !cookieUnlocks((await cookies()).get(SITE_AUTH_COOKIE)?.value)
    : false;

  // Recompute level + earned badges on every server render (including the
  // router.refresh() the games fire after scoring) so the reward toast can
  // celebrate a level-up or new badge on any page. Fail soft: if there's no
  // player cookie yet (e.g. an edge render before the proxy sets it), skip it.
  let rewardLevel = 0;
  let rewardBadges: RewardBadge[] = [];
  if (!locked) {
    try {
      const player = await getOrCreatePlayer();
      const games = getGamesWithProgress(player.id);
      const challengesCleared = games.reduce(
        (sum, g) => sum + g.clearedChallenges,
        0,
      );
      const gamesCompleted = games.filter((g) => g.status === "completed").length;
      const level = levelInfoForXp(player.xp).level;
      rewardLevel = level;
      rewardBadges = computeBadges({
        challengesCleared,
        gamesCompleted,
        totalGames: games.length,
        level,
        totalXp: player.xp,
      })
        .filter((b) => b.earned)
        .map((b) => ({ id: b.id, label: b.label }));
    } catch {
      // No resolvable player — leave the toast unmounted.
    }
  }

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable} ${hanken.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {!locked && rewardLevel > 0 && (
          <RewardToast level={rewardLevel} badges={rewardBadges} />
        )}
        {locked && <SiteLock />}
      </body>
    </html>
  );
}
