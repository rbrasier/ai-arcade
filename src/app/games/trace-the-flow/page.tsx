import { notFound } from "next/navigation";

import { TraceFlowGame, type RoundRef } from "@/components/game/TraceFlowGame";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function TraceTheFlowPage() {
  const data = getGameBySlug("trace-the-flow");
  if (!data) notFound();

  // Each seeded challenge is one round; difficulty drives live generation.
  const rounds: RoundRef[] = data.challenges.map((c) => ({
    id: c.id,
    difficulty: Number(
      (c.config as { difficulty?: number } | null)?.difficulty ?? 1,
    ),
  }));

  return <TraceFlowGame rounds={rounds} />;
}
