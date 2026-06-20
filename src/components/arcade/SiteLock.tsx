"use client";

import { useEffect, useRef, useState } from "react";

import { SITE_UNLOCK_PATH } from "@/lib/site-auth";

/**
 * Full-screen, non-dismissable gate shown when the site is password protected
 * (`SITE_PASSWORD` set) and the visitor hasn't unlocked it yet. Submitting the
 * correct password posts to the unlock endpoint, which sets the auth cookie;
 * we then reload so the server re-renders without the lock and the AI-backed
 * API routes start responding.
 */
export function SiteLock() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const password = value.trim();
    if (!password) {
      setError("Enter the access password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(SITE_UNLOCK_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Incorrect password — try again.");
        setSubmitting(false);
        return;
      }

      // Reload so the layout re-renders unlocked and API calls succeed.
      window.location.reload();
    } catch {
      setError("Network error — try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 backdrop-blur-md"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-lock-title"
        className="w-full max-w-[400px] rounded-2xl border border-[#ece5d4] bg-[#fffdf7] p-6 shadow-[0_30px_60px_-30px_rgba(40,34,22,.6)]"
      >
        <div className="font-arcade-mono text-[11px] font-bold tracking-[.08em] text-[#ec5a3a]">
          ▶ ACCESS REQUIRED
        </div>
        <h2
          id="site-lock-title"
          className="font-display mt-1.5 text-[24px] font-bold tracking-[-0.01em]"
        >
          Enter the password
        </h2>
        <p className="mt-1.5 text-[14px] leading-[1.45] text-[#7c766a]">
          This arcade is password protected. Enter the access password to play.
        </p>

        <form onSubmit={handleSubmit} className="mt-4">
          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Access password"
            aria-label="Access password"
            aria-invalid={error ? true : undefined}
            className="w-full rounded-[11px] border border-[#e0d9c6] bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-[#ec5a3a]"
          />

          {error && (
            <p className="mt-2 text-[13px] text-[#c0392b]" role="alert">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-[9px] bg-[#ec5a3a] px-[18px] py-2 font-arcade-mono text-[12px] font-bold tracking-[.05em] text-white disabled:opacity-60"
            >
              {submitting ? "UNLOCKING…" : "UNLOCK ▶"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
