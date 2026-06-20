import { notFound } from "next/navigation";

import {
  CheckpointPlacementGame,
  type RoundRef,
} from "@/components/game/CheckpointPlacementGame";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function CheckpointPlacementPage() {
  const data = getGameBySlug("checkpoint-placement");
  if (!data) notFound();

  // Each seeded challenge is one round; difficulty drives live generation.
  const rounds: RoundRef[] = data.challenges.map((c) => ({
    id: c.id,
    difficulty: Number(
      (c.config as { difficulty?: number } | null)?.difficulty ?? 1,
    ),
  }));

  return <CheckpointPlacementGame rounds={rounds} />;
}
