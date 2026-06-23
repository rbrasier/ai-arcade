"use client";

import React from "react";

const MONO = "var(--font-space-mono), monospace";

/**
 * Placeholder for a game's video explainer, shown on the left of each game's
 * "how to play" modal. Renders the narration script as subtle small text behind
 * a play icon — the box is a stand-in to be swapped for the real video once the
 * explainers are produced.
 */
export function VideoPlaceholder({
  script,
  accent,
  title = "Watch the explainer",
}: {
  script: string;
  accent: string;
  title?: string;
}) {
  return (
    <div
      role="img"
      aria-label="Video explainer placeholder — coming soon"
      style={{
        position: "relative",
        flex: "1 1 300px",
        minWidth: 240,
        alignSelf: "stretch",
        minHeight: 300,
        borderRadius: 16,
        overflow: "hidden",
        background: "linear-gradient(165deg, #2c2922 0%, #3b362c 100%)",
        border: "1px solid #ece5d4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22,
      }}
    >
      {/* Narration script — subtle, behind the play icon, to be replaced by video */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          padding: "18px 20px",
          fontFamily: MONO,
          fontSize: 10,
          lineHeight: 1.7,
          letterSpacing: ".01em",
          color: "rgba(255,253,247,0.14)",
          overflow: "hidden",
          userSelect: "none",
          pointerEvents: "none",
          maskImage: "linear-gradient(180deg, #000 60%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(180deg, #000 60%, transparent 100%)",
        }}
      >
        {script}
      </div>

      {/* Play icon + caption */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 13,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 66,
            height: 66,
            borderRadius: "50%",
            background: accent,
            boxShadow: `0 10px 30px -6px color-mix(in srgb, ${accent} 70%, transparent)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* play triangle */}
          <div
            style={{
              width: 0,
              height: 0,
              marginLeft: 5,
              borderTop: "13px solid transparent",
              borderBottom: "13px solid transparent",
              borderLeft: "21px solid #fffdf7",
            }}
          />
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "rgba(255,253,247,0.82)",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "rgba(255,253,247,0.38)",
          }}
        >
          video coming soon
        </div>
      </div>
    </div>
  );
}
