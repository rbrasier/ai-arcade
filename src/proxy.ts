import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  SITE_AUTH_COOKIE,
  SITE_AUTH_COOKIE_OPTIONS,
  SITE_KEY_PARAM,
  SITE_UNLOCK_PATH,
  getSitePassword,
} from "@/lib/site-auth";

export const PLAYER_COOKIE = "arcade_pid";

/**
 * Ensures every visitor has an anonymous player id cookie. The id is generated
 * here (so it's available to the very first render) and persisted on the
 * response. The matching player row is created lazily in `getOrCreatePlayer`.
 */
function withPlayerCookie(request: NextRequest): NextResponse {
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

export function proxy(request: NextRequest) {
  const password = getSitePassword();

  // --- Optional site password gate ---------------------------------------
  // Only active when `SITE_PASSWORD` is configured; otherwise the site is open.
  if (password) {
    const url = request.nextUrl;
    const keyParam = url.searchParams.get(SITE_KEY_PARAM);

    // A correct `?key=…` unlocks the site immediately, then we redirect to the
    // same URL with the param stripped so the password doesn't linger in the
    // address bar, history or referrer headers.
    if (keyParam !== null && keyParam === password) {
      const clean = url.clone();
      clean.searchParams.delete(SITE_KEY_PARAM);
      const response = NextResponse.redirect(clean);
      response.cookies.set(
        SITE_AUTH_COOKIE,
        password,
        SITE_AUTH_COOKIE_OPTIONS,
      );
      return response;
    }

    const unlocked = request.cookies.get(SITE_AUTH_COOKIE)?.value === password;

    // Block the AI-backed API while locked so the token can't be spammed. The
    // unlock endpoint itself must stay reachable. Page requests fall through and
    // render; the SiteLock overlay prompts for the password client-side.
    if (
      !unlocked &&
      url.pathname.startsWith("/api/") &&
      url.pathname !== SITE_UNLOCK_PATH
    ) {
      return NextResponse.json({ error: "Site locked" }, { status: 401 });
    }
  }

  // --- Anonymous player id -----------------------------------------------
  return withPlayerCookie(request);
}

export const config = {
  // Run on pages and API routes, skip static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
