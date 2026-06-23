import { notFound } from "next/navigation";

import {
  CleanThePipeGame,
  type RoundRef,
} from "@/components/game/CleanThePipeGame";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function CleanThePipePage() {
  const data = getGameBySlug("clean-the-pipe");
  if (!data) notFound();

  // Each seeded challenge is one round; difficulty drives live generation.
  const rounds: RoundRef[] = data.challenges.map((c) => ({
    id: c.id,
    difficulty: Number(
      (c.config as { difficulty?: number } | null)?.difficulty ?? 1,
    ),
  }));

  return <CleanThePipeGame rounds={rounds} />;
}
