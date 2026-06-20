/**
 * Optional site-wide password gate.
 *
 * When `SITE_PASSWORD` is set, visitors must unlock the arcade once — either by
 * entering the password in the lock modal or by visiting with a `?key=…` URL
 * param — before the AI-backed API routes will respond. This keeps the
 * configured AI token from being spammed by anonymous traffic. When the env var
 * is unset (or blank) the site is fully open with no restrictions.
 *
 * This module is intentionally dependency-free so it can be imported from
 * `proxy.ts` (which runs in the middleware runtime), API route handlers and
 * server components alike. The shared password is the cookie value, so changing
 * `SITE_PASSWORD` automatically invalidates previously issued cookies.
 */

/** Cookie that records a visitor has unlocked the site. */
export const SITE_AUTH_COOKIE = "arcade_site_auth";

/** Query param that unlocks the site and bypasses the prompt, e.g. `?key=…`. */
export const SITE_KEY_PARAM = "key";

/** Endpoint the lock modal posts to — always reachable while locked. */
export const SITE_UNLOCK_PATH = "/api/unlock";

/** Shared cookie options for the auth cookie (≈ one year, http-only). */
export const SITE_AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
} as const;

/**
 * The configured site password, or `null` when access is unrestricted.
 * Blank / whitespace-only values are treated as unset so an empty env doesn't
 * accidentally lock everyone out.
 */
export function getSitePassword(): string | null {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return null;
  const trimmed = pw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Whether a submitted attempt matches the configured password (open ⇒ true). */
export function isCorrectPassword(attempt: string | undefined | null): boolean {
  const password = getSitePassword();
  if (!password) return true;
  return typeof attempt === "string" && attempt === password;
}

/** Whether the stored auth-cookie value currently unlocks the site (open ⇒ true). */
export function cookieUnlocks(cookieValue: string | undefined | null): boolean {
  const password = getSitePassword();
  if (!password) return true;
  return cookieValue === password;
}
