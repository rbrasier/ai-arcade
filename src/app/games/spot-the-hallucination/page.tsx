import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ChallengeRunner,
  type RunnerChallenge,
} from "@/components/game/ChallengeRunner";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function SpotTheHallucinationPage() {
  const data = getGameBySlug("spot-the-hallucination");
  if (!data) notFound();

  const challenges: RunnerChallenge[] = data.challenges.map((c) => ({
    id: c.id,
    title: c.title,
    prompt: c.prompt,
    maxScore: c.maxScore,
    config: c.config,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="text-sm text-black/50 hover:text-indigo-500 dark:text-white/50"
      >
        ← Back to arcade
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{data.game.title}</h1>
        <p className="mt-1 text-black/60 dark:text-white/60">
          {data.game.description}
        </p>
      </header>

      <ChallengeRunner
        challenges={challenges}
        variant="spot-the-hallucination"
      />
    </main>
  );
}
