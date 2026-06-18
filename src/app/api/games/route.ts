import { NextResponse } from "next/server";

import { getOrCreatePlayer } from "@/lib/player";
import { getGamesWithProgress } from "@/lib/progress";

export async function GET() {
  const player = await getOrCreatePlayer();
  return NextResponse.json({ games: getGamesWithProgress(player.id) });
}
