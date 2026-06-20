import { notFound } from "next/navigation";

import {
  ContextCalibrationGame,
  type RoundRef,
} from "@/components/game/ContextCalibrationGame";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function ContextCalibrationPage() {
  const data = getGameBySlug("context-calibration");
  if (!data) notFound();

  // Each seeded challenge is one round; difficulty drives live generation.
  const rounds: RoundRef[] = data.challenges.map((c) => ({
    id: c.id,
    difficulty: Number(
      (c.config as { difficulty?: number } | null)?.difficulty ?? 1,
    ),
  }));

  return <ContextCalibrationGame rounds={rounds} />;
}
