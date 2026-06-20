import { NextResponse } from "next/server";

import {
  SITE_AUTH_COOKIE,
  SITE_AUTH_COOKIE_OPTIONS,
  getSitePassword,
  isCorrectPassword,
} from "@/lib/site-auth";

/**
 * Unlocks the site for a visitor who submits the correct `SITE_PASSWORD`.
 * Sets the long-lived auth cookie that `proxy.ts` checks before allowing the
 * AI-backed API routes to respond. When no password is configured the site is
 * open and this is a no-op.
 */
export async function POST(request: Request) {
  const password = getSitePassword();
  if (!password) {
    return NextResponse.json({ ok: true });
  }

  const body = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;

  if (!isCorrectPassword(body?.password)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect password." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SITE_AUTH_COOKIE, password, SITE_AUTH_COOKIE_OPTIONS);
  return response;
}
