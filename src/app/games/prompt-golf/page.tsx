import { notFound } from "next/navigation";

import {
  PromptGolfGame,
  type RoundRef,
} from "@/components/game/PromptGolfGame";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function PromptGolfPage() {
  const data = getGameBySlug("prompt-golf");
  if (!data) notFound();

  // Each seeded challenge is one round; difficulty drives live generation.
  const rounds: RoundRef[] = data.challenges.map((c) => ({
    id: c.id,
    difficulty: Number(
      (c.config as { difficulty?: number } | null)?.difficulty ?? 1,
    ),
  }));

  return <PromptGolfGame rounds={rounds} />;
}
