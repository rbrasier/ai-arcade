"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "arcade:unlockedGames";

export interface UnlockToastGame {
  slug: string;
  title: string;
  /** True when the game is still locked for this player. */
  locked: boolean;
}

interface Toast {
  id: number;
  title: string;
}

/**
 * Watches which games are unlocked for the player and pops a prominent toast at
 * the bottom of the screen (auto-dismissing after 5s) whenever a game becomes
 * newly available — e.g. after finishing the AI Foundations course unlocks Spot
 * the Hallucination.
 *
 * "Already unlocked" games are remembered per-browser in localStorage, so the
 * toast only fires on a genuine new unlock, never on every visit. The first
 * ever load seeds the snapshot silently.
 */
export function UnlockToast({ games }: { games: UnlockToastGame[] }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unlockedNow = games.filter((g) => !g.locked).map((g) => g.slug);

    let seen: string[] | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) seen = JSON.parse(raw) as string[];
    } catch {
      seen = null;
    }

    if (seen === null) {
      // First load on this browser — record the baseline without announcing it.
      persist(unlockedNow);
      return;
    }

    const seenSet = new Set(seen);
    const fresh = games.filter((g) => !g.locked && !seenSet.has(g.slug));

    if (fresh.length > 0) {
      const base = Date.now();
      setToasts((prev) => [
        ...prev,
        ...fresh.map((g, i) => ({ id: base + i, title: g.title })),
      ]);
    }

    // Remember everything currently unlocked (union with prior snapshot, so a
    // re-lock edge case never re-announces an already-seen game).
    persist([...new Set([...seen, ...unlockedNow])]);
  }, [games]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 5000),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "min(420px, calc(100vw - 32px))",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          style={{
            ["--accent" as string]: "#ec5a3a",
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 13,
            background: "#211f1a",
            color: "#f6f3ec",
            border: "1px solid #3a362e",
            borderRadius: 14,
            padding: "14px 16px",
            boxShadow: "0 22px 50px -22px rgba(0,0,0,.6)",
            animation: "hg-slideUp .45s ease",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              flex: "none",
              borderRadius: 10,
              background: "#ec5a3a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="#fff" strokeWidth="2.2" />
              <path d="M8 11 V8 a4 4 0 0 1 7.5 -2" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-space-mono), monospace",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "#f6a98f",
              }}
            >
              New game unlocked
            </div>
            <div
              style={{
                fontFamily: "var(--font-bricolage), sans-serif",
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1.2,
                marginTop: 2,
              }}
            >
              {t.title}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function persist(slugs: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    // Ignore storage failures (private mode, quota) — the toast is non-critical.
  }
}
