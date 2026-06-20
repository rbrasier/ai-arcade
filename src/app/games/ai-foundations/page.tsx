import { notFound } from "next/navigation";

import { FoundationsCourse } from "@/components/game/FoundationsCourse";
import { getGameBySlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default function AiFoundationsPage() {
  const data = getGameBySlug("ai-foundations");
  if (!data) notFound();

  return <FoundationsCourse />;
}
