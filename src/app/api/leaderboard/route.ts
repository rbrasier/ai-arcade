import { NextResponse } from "next/server";

import { getLeaderboard } from "@/lib/progress";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") === "all" ? "all" : "week";
  return NextResponse.json({ range, entries: getLeaderboard(range) });
}
