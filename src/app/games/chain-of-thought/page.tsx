import { notFound } from "next/navigation";

import {
  ChainOfThoughtGame,
  type RoundRef,
} from "@/components/game/ChainOfThoughtGame";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function ChainOfThoughtPage() {
  const data = getGameBySlug("chain-of-thought");
  if (!data) notFound();

  // Each seeded challenge is one round; difficulty drives live generation.
  const rounds: RoundRef[] = data.challenges.map((c) => ({
    id: c.id,
    difficulty: Number(
      (c.config as { difficulty?: number } | null)?.difficulty ?? 1,
    ),
  }));

  return <ChainOfThoughtGame rounds={rounds} />;
}
