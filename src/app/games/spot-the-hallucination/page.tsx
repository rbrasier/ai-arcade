import { notFound } from "next/navigation";

import {
  HallucinationGame,
  type RoundRef,
} from "@/components/game/HallucinationGame";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function SpotTheHallucinationPage() {
  const data = getGameBySlug("spot-the-hallucination");
  if (!data) notFound();

  // Each seeded challenge is one round; difficulty drives live generation.
  const rounds: RoundRef[] = data.challenges.map((c) => ({
    id: c.id,
    difficulty: Number(
      (c.config as { difficulty?: number } | null)?.difficulty ?? 1,
    ),
  }));

  return <HallucinationGame rounds={rounds} />;
}
