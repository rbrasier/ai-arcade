"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "arcade:achievements";

export interface EarnedBadge {
  id: string;
  label: string;
}

interface Snapshot {
  level: number;
  badges: string[];
}

type ToastKind = "level" | "badge";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  subtitle: string;
}

/**
 * Global, page-agnostic celebration toast. The root layout re-renders its
 * server components on every `router.refresh()` (which the games call after a
 * scored attempt), feeding the player's current level and earned badges in as
 * props. This component diffs those against a per-browser snapshot in
 * localStorage and pops a congratulatory toast whenever the player levels up or
 * earns a new badge — wherever they happen to be in the app, no per-game wiring.
 *
 * The first load on a browser seeds the snapshot silently so we never celebrate
 * progress the player already had.
 */
export function AchievementToast({
  level,
  earnedBadges,
}: {
  level: number;
  earnedBadges: EarnedBadge[];
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  // Stable dependency for the effect — the badge id set, order-independent.
  const badgeKey = earnedBadges
    .map((b) => b.id)
    .sort()
    .join(",");

  useEffect(() => {
    const currentBadges = earnedBadges.map((b) => b.id);

    let prev: Snapshot | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) prev = JSON.parse(raw) as Snapshot;
    } catch {
      prev = null;
    }

    const persist = (snap: Snapshot) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      } catch {
        // Non-critical (private mode / quota) — the toast is best-effort.
      }
    };

    if (prev === null) {
      // First sighting on this browser — record the baseline, celebrate nothing.
      persist({ level, badges: currentBadges });
      return;
    }

    const fresh: Toast[] = [];

    if (level > prev.level) {
      fresh.push({
        id: seq.current++,
        kind: "level",
        title: `Level ${level}!`,
        subtitle: "You leveled up — nice work.",
      });
    }

    const seen = new Set(prev.badges);
    for (const b of earnedBadges) {
      if (!seen.has(b.id)) {
        fresh.push({
          id: seq.current++,
          kind: "badge",
          title: "Badge unlocked",
          subtitle: `“${b.label}” — well earned!`,
        });
      }
    }

    if (fresh.length > 0) {
      setToasts((cur) => [...cur, ...fresh]);
    }

    // Snapshot the new high-water mark (union of badges, never un-earn).
    persist({
      level: Math.max(level, prev.level),
      badges: [...new Set([...prev.badges, ...currentBadges])],
    });
  }, [level, badgeKey, earnedBadges]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== t.id));
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
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "min(420px, calc(100vw - 32px))",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const isLevel = toast.kind === "level";
  const accent = isLevel ? "#ec5a3a" : "#1f8a5b";
  return (
    <div
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
          background: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isLevel ? <LevelGlyph /> : <BadgeGlyph />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-space-mono), monospace",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: isLevel ? "#f6a98f" : "#8fd3b1",
          }}
        >
          {isLevel ? "Level up" : "Achievement"}
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
          {toast.title}
        </div>
        <div
          style={{
            fontFamily: "var(--font-hanken), system-ui, sans-serif",
            fontSize: 12.5,
            color: "#c8c2b4",
            marginTop: 2,
          }}
        >
          {toast.subtitle}
        </div>
      </div>
    </div>
  );
}

function LevelGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3 L14.6 9.1 L21 9.6 L16.2 13.9 L17.6 20.2 L12 16.9 L6.4 20.2 L7.8 13.9 L3 9.6 L9.4 9.1 Z"
        fill="#fff"
      />
    </svg>
  );
}

function BadgeGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="10" r="6.5" stroke="#fff" strokeWidth="2.2" />
      <path
        d="M8.5 15 L7 22 L12 19 L17 22 L15.5 15"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
