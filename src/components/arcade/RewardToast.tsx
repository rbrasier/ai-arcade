"use client";

import { useEffect, useState } from "react";

const LEVEL_KEY = "arcade:level";
const BADGES_KEY = "arcade:badges";

export interface RewardBadge {
  id: string;
  label: string;
}

interface Toast {
  id: number;
  kind: "level" | "badge";
  title: string;
  detail: string;
}

/**
 * Celebrates progress on ANY page. The root layout recomputes the player's level
 * and earned badges on every server render — including the `router.refresh()`
 * the games fire right after scoring — and passes them here. This client toast
 * diffs the fresh values against a per-browser localStorage snapshot and pops a
 * prominent bottom toast (auto-dismissing after 5s) on a level-up or a newly
 * earned badge.
 *
 * The very first load on a browser seeds the snapshot silently, so existing
 * progress is never re-celebrated. Like `UnlockToast`, snapshots are unioned so a
 * transient dip never re-announces something already seen.
 */
export function RewardToast({
  level,
  badges,
}: {
  level: number;
  badges: RewardBadge[];
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const earnedIds = badges.map((b) => b.id);

    let seenLevel: number | null = null;
    let seenBadges: string[] | null = null;
    try {
      const rawLevel = window.localStorage.getItem(LEVEL_KEY);
      if (rawLevel !== null) seenLevel = Number(rawLevel);
      const rawBadges = window.localStorage.getItem(BADGES_KEY);
      if (rawBadges !== null) seenBadges = JSON.parse(rawBadges) as string[];
    } catch {
      seenLevel = null;
      seenBadges = null;
    }

    // First load on this browser — record the baseline without announcing it.
    if (seenLevel === null || seenBadges === null) {
      persist(level, earnedIds);
      return;
    }

    const fresh: Toast[] = [];
    const base = Date.now();

    if (level > seenLevel) {
      fresh.push({
        id: base,
        kind: "level",
        title: "Level up!",
        detail: `You reached level ${level}`,
      });
    }

    const seenBadgeSet = new Set(seenBadges);
    badges
      .filter((b) => !seenBadgeSet.has(b.id))
      .forEach((b, i) => {
        fresh.push({
          id: base + i + 1,
          kind: "badge",
          title: "Badge earned",
          detail: b.label,
        });
      });

    if (fresh.length > 0) {
      setToasts((prev) => [...prev, ...fresh]);
    }

    persist(
      Math.max(level, seenLevel),
      [...new Set([...seenBadges, ...earnedIds])],
    );
  }, [level, badges]);

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
              background: t.kind === "level" ? "#e0a52e" : "#ec5a3a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {t.kind === "level" ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3 L8 11 H11 L10 21 L16 10 H12.5 L15 3 Z"
                  fill="#fff"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="9.5" r="5.5" stroke="#fff" strokeWidth="2.2" />
                <path
                  d="M8.5 14 L7 21 L12 18.5 L17 21 L15.5 14"
                  stroke="#fff"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-space-mono), monospace",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: t.kind === "level" ? "#f3cd86" : "#f6a98f",
              }}
            >
              {t.title}
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
              {t.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function persist(level: number, badgeIds: string[]) {
  try {
    window.localStorage.setItem(LEVEL_KEY, String(level));
    window.localStorage.setItem(BADGES_KEY, JSON.stringify(badgeIds));
  } catch {
    // Ignore storage failures (private mode, quota) — the toast is non-critical.
  }
}
