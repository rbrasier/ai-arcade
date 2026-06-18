import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const PLAYER_COOKIE = "arcade_pid";

/**
 * Ensures every visitor has an anonymous player id cookie. The id is generated
 * here (so it's available to the very first render) and persisted on the
 * response. The matching player row is created lazily in `getOrCreatePlayer`.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(PLAYER_COOKIE)) {
    return NextResponse.next();
  }

  const playerId = crypto.randomUUID();
  request.cookies.set(PLAYER_COOKIE, playerId);

  const response = NextResponse.next({ request });
  response.cookies.set(PLAYER_COOKIE, playerId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  // Run on pages and API routes, skip static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
