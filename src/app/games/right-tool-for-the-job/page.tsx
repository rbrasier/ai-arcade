import { notFound } from "next/navigation";

import {
  RightToolForTheJobGame,
  type RoundRef,
} from "@/components/game/RightToolForTheJobGame";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function RightToolForTheJobPage() {
  const data = getGameBySlug("right-tool-for-the-job");
  if (!data) notFound();

  // Each seeded challenge is one round; difficulty drives live generation.
  const rounds: RoundRef[] = data.challenges.map((c) => ({
    id: c.id,
    difficulty: Number(
      (c.config as { difficulty?: number } | null)?.difficulty ?? 1,
    ),
  }));

  return <RightToolForTheJobGame rounds={rounds} />;
}
