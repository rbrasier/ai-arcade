import { notFound } from "next/navigation";

import {
  WorkflowRedesignGame,
  type RoundRef,
} from "@/components/game/WorkflowRedesignGame";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function WorkflowRedesignPage() {
  const data = getGameBySlug("workflow-redesign");
  if (!data) notFound();

  // Each seeded challenge is one scenario; its config.scenario drives generation.
  const rounds: RoundRef[] = data.challenges.map((c) => ({
    id: c.id,
    scenarioKey: String(
      (c.config as { scenario?: string } | null)?.scenario ?? "hr-onboarding",
    ),
  }));

  return <WorkflowRedesignGame rounds={rounds} />;
}
