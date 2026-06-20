"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const ACCENT = "#ec5a3a";
const DISPLAY = "var(--font-bricolage), sans-serif";
const BODY = "var(--font-hanken), system-ui, sans-serif";
const MONO = "var(--font-space-mono), monospace";

/**
 * The introductory "AI Foundations" course. The interactive slides live as a
 * self-contained static document (public/ai-foundations-course.html) embedded in
 * an iframe — this keeps the hand-built course intact while the React wrapper
 * handles arcade concerns: recording completion and pointing the player back.
 *
 * The embedded document posts an `ai-foundations:complete` message when the
 * player reaches the final slide; that triggers the (idempotent) completion
 * call, which clears the course and unlocks the next game.
 */
export function FoundationsCourse() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const submitted = useRef(false);

  const complete = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    try {
      await fetch("/api/games/foundations/complete", { method: "POST" });
    } catch {
      // Best-effort: even if the network blips, the player still finished the
      // course. Allow a retry on the next completion message.
      submitted.current = false;
      return;
    }
    setDone(true);
    // Refresh server components so the arcade reflects the new unlock on return.
    router.refresh();
  }, [router]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Same-origin static asset, but guard the payload shape regardless.
      if (
        e.source === window ||
        typeof e.data !== "object" ||
        e.data === null
      ) {
        return;
      }
      const type = (e.data as { type?: string }).type;
      if (type === "ai-foundations:complete") {
        void complete();
      } else if (type === "ai-foundations:exit") {
        // The "Finish" button on the last slide returns to the arcade.
        router.push("/");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [complete, router]);

  return (
    <div
      style={{
        ["--accent" as string]: ACCENT,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f6f3ec",
        fontFamily: BODY,
        color: "#211f1a",
      }}
    >
      {/* ===== TOP BAR ===== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 22px",
          borderBottom: "1px solid #e2dcca",
          background: "#fbf8f0",
          flex: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <Link href="/" style={backLink}>
            ← ARCADE
          </Link>
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 19,
              letterSpacing: "-0.015em",
              whiteSpace: "nowrap",
            }}
          >
            AI Foundations
          </div>
        </div>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: ".04em",
            color: done ? "#1f8a5b" : "#9a9488",
            background: done ? "rgba(31,138,91,.1)" : "#fff",
            border: `1px solid ${done ? "rgba(31,138,91,.35)" : "#e2dcca"}`,
            padding: "7px 12px",
            borderRadius: 9,
            whiteSpace: "nowrap",
          }}
        >
          {done ? "✓ COMPLETE" : "STARTER COURSE"}
        </span>
      </div>

      {/* ===== COURSE ===== */}
      {/*
       * Reaching the final slide marks the course complete (the header chip
       * flips to "✓ COMPLETE"). We deliberately do NOT pop a completion toast
       * here — the celebratory "new game unlocked" toast belongs on the arcade
       * home page (UnlockToast), which fires when the player returns and sees
       * Spot the Hallucination has unlocked.
       */}
      <iframe
        src="/ai-foundations-course.html"
        title="AI Foundations — Interactive Course"
        style={{ flex: 1, width: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}

const backLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  textDecoration: "none",
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".04em",
  color: "#7c766a",
  border: "1px solid #e2dcca",
  background: "#fff",
  padding: "7px 12px",
  borderRadius: 9,
  whiteSpace: "nowrap",
};
