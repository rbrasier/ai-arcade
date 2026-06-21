"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ContextItemKind } from "@/lib/context-calibration-scoring";

const ACCENT = "#0f9b8e";
const DISPLAY = "var(--font-bricolage), sans-serif";
const BODY = "var(--font-hanken), system-ui, sans-serif";
const MONO = "var(--font-space-mono), monospace";
const GREEN = "#1f8a5b";
const RED = "#c0563a";
const AMBER = "#c9933f";

export interface RoundRef {
  id: string;
  difficulty: number;
}

interface Item {
  id: string;
  text: string;
}
interface SafeScenario {
  topic: string;
  task: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  goal: string;
  items: Item[];
}

interface ResultItem {
  id: string;
  text: string;
  kind: ContextItemKind;
  reason?: string;
  selected: boolean;
}

interface ScoreResult {
  score: number;
  maxScore: number;
  completeness: number;
  focus: number;
  essentialsTotal: number;
  essentialsIncluded: number;
  distractorTotal: number;
  distractorIncluded: number;
  missedEssential: boolean;
  items: ResultItem[];
  goal: string;
  output: string;
  explanation: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "modal" | "curate";

interface HistoryEntry {
  score: number;
  xp: number;
  completeness: number;
  focus: number;
  exceptional: boolean;
}

export function ContextCalibrationGame({ rounds }: { rounds: RoundRef[] }) {
  const router = useRouter();
  const total = rounds.length || 5;

  const [roundIndex, setRoundIndex] = useState(0);
  const [screen, setScreen] = useState<"play" | "results" | "summary">("play");
  const [phase, setPhase] = useState<Phase>("intro");
  const [scenario, setScenario] = useState<SafeScenario | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // ---- round prefetch (all five warmed behind the intro, sequentially, so each
  // can be told the topics already used and pick a fresh theme) ----
  type LoadedRound = { roundId: string; scenario: SafeScenario };
  const prefetchRef = useRef<Map<number, Promise<LoadedRound>>>(new Map());
  const usedTopicsRef = useRef<string[]>([]);
  const [playToken, setPlayToken] = useState(0);

  const prefetchRound = useCallback(
    (index: number): Promise<LoadedRound> => {
      const cached = prefetchRef.current.get(index);
      if (cached) return cached;
      const round = rounds[index];
      if (!round) return Promise.reject(new Error("No such round"));
      const p = (async () => {
        const res = await fetch("/api/games/context-calibration/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: round.id,
            difficulty: round.difficulty,
            avoidTopics: [...usedTopicsRef.current],
          }),
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as LoadedRound & { topic?: string };
        const topic = data.topic ?? data.scenario.topic;
        if (topic && !usedTopicsRef.current.includes(topic)) {
          usedTopicsRef.current.push(topic);
        }
        return { roundId: data.roundId, scenario: data.scenario };
      })();
      p.catch(() => prefetchRef.current.delete(index));
      prefetchRef.current.set(index, p);
      return p;
    },
    [rounds],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < total; i++) {
        if (cancelled) return;
        try {
          await prefetchRound(i);
        } catch {
          // A failed warm-up is harmless; loadRound surfaces errors on demand.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [total, playToken, prefetchRound]);

  // ---- round loading ----
  const loadRound = useCallback(
    async (index: number) => {
      const round = rounds[index];
      if (!round) return;
      setScreen("play");
      setPhase("loading");
      setScenario(null);
      setRoundId(null);
      setResult(null);
      setSelected(new Set());
      setLoadError(null);
      try {
        const data = await prefetchRound(index);
        setScenario(data.scenario);
        setRoundId(data.roundId);
        setPhase("modal");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load round");
      }
    },
    [rounds, prefetchRound],
  );

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!roundId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/games/context-calibration/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId,
          selectedItemIds: [...selected],
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ScoreResult;
      setResult(data);
      setHistory((h) => [
        ...h,
        {
          score: data.score,
          xp: data.xpEarned + data.bonusXp,
          completeness: data.completeness,
          focus: data.focus,
          exceptional: data.exceptional,
        },
      ]);
      setScreen("results");
      router.refresh();
    } catch {
      setLoadError("Could not submit — try again.");
    } finally {
      setSubmitting(false);
    }
  }, [roundId, selected, router]);

  const nextRound = useCallback(() => {
    if (roundIndex + 1 >= total) {
      setScreen("summary");
      return;
    }
    const next = roundIndex + 1;
    setRoundIndex(next);
    loadRound(next);
  }, [roundIndex, total, loadRound]);

  const restart = useCallback(() => {
    prefetchRef.current = new Map();
    usedTopicsRef.current = [];
    setPlayToken((t) => t + 1);
    setHistory([]);
    setRoundIndex(0);
    setScreen("play");
    setPhase("intro");
    setScenario(null);
    setRoundId(null);
    setResult(null);
    setSelected(new Set());
  }, []);

  // ===================== RENDER =====================
  const pageStyle: React.CSSProperties = {
    ["--accent" as string]: ACCENT,
    minHeight: "100vh",
    background: "radial-gradient(120% 80% at 80% -10%, #ecf7f5 0%, #e3f1ee 55%)",
    fontFamily: BODY,
    color: "#1c2422",
    padding: "22px 24px 70px",
  };

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        {/* ===== TOP BAR ===== */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            paddingBottom: 18,
            marginBottom: 20,
            borderBottom: "1px solid #cfe4df",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <Link href="/" style={backChip}>
              ← ARCADE
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: 10,
                  background:
                    "linear-gradient(150deg, color-mix(in srgb, var(--accent) 22%, #fff), #fff)",
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, #d6e8e4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 6h16M4 12h10M4 18h7"
                    stroke="#1c2422"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <circle cx="18" cy="16.5" r="3.2" stroke={ACCENT} strokeWidth="1.8" />
                </svg>
              </div>
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: 20,
                  letterSpacing: "-0.015em",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                Context Calibration
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={chipStyle}>
              ROUND {Math.min(roundIndex + 1, total)} / {total}
            </span>
            <button onClick={restart} style={{ ...chipStyle, cursor: "pointer" }}>
              ↻ REPLAY
            </button>
          </div>
        </div>

        {/* ===== INTRO MODAL ===== */}
        {screen === "play" && phase === "intro" && (
          <IntroModal onStart={() => loadRound(0)} />
        )}

        {/* ===== GAME ===== */}
        {screen === "play" && phase !== "intro" && (
          <div
            style={{
              position: "relative",
              border: "1px solid #d6e8e4",
              borderRadius: 22,
              background: "#fffdfb",
              boxShadow: "0 22px 50px -28px rgba(20,60,55,.4)",
              overflow: "hidden",
            }}
          >
            {/* header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "15px 20px",
                borderBottom: "1px solid #e6f1ee",
                background: "#f6faf9",
              }}
            >
              <div style={diamondAvatar(38)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 7h14M5 12h9M5 17h6" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
                  Context Tray
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#7d918c", letterSpacing: ".02em" }}>
                  attach only the context the answer needs
                </div>
              </div>
            </div>

            {/* body */}
            <div
              style={{
                padding: "22px 22px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                minHeight: 420,
              }}
            >
              {/* loading */}
              {phase === "loading" && (
                <div
                  style={{
                    margin: "auto",
                    textAlign: "center",
                    fontFamily: MONO,
                    fontSize: 13,
                    color: "#7d918c",
                  }}
                >
                  {loadError ? (
                    <div style={{ color: RED }}>
                      {loadError}
                      <div style={{ marginTop: 12 }}>
                        <button onClick={() => loadRound(roundIndex)} style={primaryBtn}>
                          RETRY
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Dots big />
                      <div style={{ marginTop: 12 }}>Preparing your task…</div>
                    </>
                  )}
                </div>
              )}

              {scenario && phase === "curate" && (
                <>
                  {/* the task + goal — compact */}
                  <div
                    style={{
                      border: "1px solid #e6f1ee",
                      borderRadius: 12,
                      background: "#f6faf9",
                      padding: "12px 14px",
                    }}
                  >
                    <div style={kicker}>
                      the task · from {scenario.task.senderName} · {scenario.task.senderRole}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.5, color: "#33433f" }}>
                      {scenario.task.message}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 14.5, fontWeight: 700, color: "#1c2422" }}>
                      🎯 {scenario.goal}
                    </div>
                  </div>

                  {/* context library — compact, attachable tiles */}
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <div style={kicker}>context library · tap to attach to your message</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#7d918c" }}>
                      {selected.size} of {scenario.items.length} attached
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {scenario.items.map((it) => {
                      const on = selected.has(it.id);
                      return (
                        <button
                          key={it.id}
                          onClick={() => toggleItem(it.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            textAlign: "left",
                            fontFamily: BODY,
                            fontSize: 13.5,
                            lineHeight: 1.4,
                            color: "#1c2422",
                            background: on
                              ? "color-mix(in srgb, var(--accent) 10%, #fff)"
                              : "#fff",
                            border: `1.5px solid ${on ? ACCENT : "#dce8e5"}`,
                            borderRadius: 10,
                            padding: "8px 12px",
                            cursor: "pointer",
                            transition: "border-color .14s, background .14s",
                          }}
                        >
                          <span style={{ flex: "none", fontSize: 15, opacity: 0.85 }}>📄</span>
                          <span style={{ flex: 1 }}>{it.text}</span>
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 9.5,
                              fontWeight: 700,
                              letterSpacing: ".04em",
                              color: on ? ACCENT : "#a7b8b3",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {on ? "✓ ATTACHED" : "ATTACH +"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* the message you're about to send — context attached like a chat */}
                  <div>
                    <div style={kicker}>your message to the assistant</div>
                    <div
                      style={{
                        border: `1.5px solid color-mix(in srgb, ${ACCENT} 35%, #d6e8e4)`,
                        borderRadius: 14,
                        background: "#fff",
                        padding: "11px 12px 10px",
                        boxShadow: "0 8px 22px -16px rgba(18,46,42,.5)",
                      }}
                    >
                      {/* attachment chips */}
                      {selected.size > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 9 }}>
                          {scenario.items
                            .filter((it) => selected.has(it.id))
                            .map((it) => (
                              <span
                                key={it.id}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  maxWidth: 220,
                                  fontFamily: MONO,
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  color: ACCENT,
                                  background: "color-mix(in srgb, var(--accent) 10%, #fff)",
                                  border: `1px solid color-mix(in srgb, ${ACCENT} 30%, #d6e8e4)`,
                                  borderRadius: 8,
                                  padding: "4px 6px 4px 8px",
                                }}
                              >
                                <span style={{ flex: "none" }}>📎</span>
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {it.text}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleItem(it.id);
                                  }}
                                  aria-label="Detach"
                                  style={{
                                    flex: "none",
                                    border: "none",
                                    background: "transparent",
                                    color: ACCENT,
                                    fontSize: 14,
                                    lineHeight: 1,
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            color: "#a7b8b3",
                            padding: "1px 2px 9px",
                          }}
                        >
                          no context attached yet — tap snippets above to attach them
                        </div>
                      )}

                      {/* the pre-filled, non-editable prompt the player is about to send */}
                      <div
                        style={{
                          background: "#f6faf9",
                          border: "1px solid #e6f1ee",
                          borderRadius: 10,
                          padding: "10px 12px",
                          fontSize: 14,
                          lineHeight: 1.5,
                          color: "#1c2422",
                        }}
                      >
                        {scenario.goal}
                      </div>

                      {/* send */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          marginTop: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontFamily: MONO, fontSize: 11.5, color: "#7d918c" }}>
                          enough signal, no noise — calibrate
                        </span>
                        <button
                          onClick={submit}
                          disabled={submitting}
                          style={{
                            ...primaryBtn,
                            padding: "10px 20px",
                            opacity: submitting ? 0.5 : 1,
                            cursor: submitting ? "default" : "pointer",
                          }}
                        >
                          {submitting ? "SENDING…" : "SEND ▶"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* TASK MODAL — fixed so a tall brief escapes the card's clip. */}
            {phase === "modal" && scenario && (
              <div style={overlay("fixed")}>
                <div style={modalCard(440)}>
                  <div style={modalKicker}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />{" "}
                    new task · direct message
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        flex: "none",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg,#0f9b8e,#5bc9bd)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: DISPLAY,
                        fontWeight: 700,
                        fontSize: 16,
                        color: "#fff",
                      }}
                    >
                      {scenario.task.senderInitials}
                    </div>
                    <div>
                      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>
                        {scenario.task.senderName}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#7d918c" }}>
                        {scenario.task.senderRole}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      lineHeight: 1.55,
                      marginTop: 16,
                      border: "1px solid #d6e8e4",
                      borderRadius: 14,
                      padding: "14px 16px",
                      background: "#f6faf9",
                      color: "#33433f",
                    }}
                  >
                    {scenario.task.message}
                  </div>
                  <button
                    onClick={() => setPhase("curate")}
                    style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}
                  >
                    OPEN THE CONTEXT TRAY →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== DEBRIEF ===== */}
        {screen === "results" && result && (
          <Debrief
            result={result}
            roundNo={roundIndex + 1}
            total={total}
            isLast={roundIndex + 1 >= total}
            onNext={nextRound}
          />
        )}

        {/* ===== FINAL SUMMARY ===== */}
        {screen === "summary" && (
          <FinalSummary history={history} total={total} onReplay={restart} />
        )}
      </div>
    </div>
  );
}

// ===================== sub-components =====================

const chipStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".04em",
  color: "#5d706b",
  background: "#f3f9f7",
  border: "1px solid #cfe4df",
  padding: "7px 12px",
  borderRadius: 9,
  whiteSpace: "nowrap",
};

const backChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  textDecoration: "none",
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".04em",
  color: "#5d706b",
  border: "1px solid #cfe4df",
  background: "#f3f9f7",
  padding: "7px 12px",
  borderRadius: 9,
  whiteSpace: "nowrap",
};

const kicker: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: "#7d918c",
  marginBottom: 7,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: ".04em",
  color: "#fff",
  background: ACCENT,
  border: "none",
  padding: "12px 22px",
  borderRadius: 11,
  cursor: "pointer",
  boxShadow: `0 12px 24px -12px ${ACCENT}`,
};

function diamondAvatar(size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    background: ACCENT,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function overlay(position: "fixed" | "absolute"): React.CSSProperties {
  return {
    ["--accent" as string]: ACCENT,
    position,
    inset: 0,
    background: "rgba(18,46,42,.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
    zIndex: 50,
    // Scroll the overlay if a tall modal exceeds the viewport, instead of being
    // clipped by the editor card (which is overflow: hidden).
    overflowY: "auto",
    animation: "hg-overlayIn .25s ease",
  };
}

function modalCard(maxWidth: number): React.CSSProperties {
  return {
    maxWidth,
    width: "100%",
    background: "#fffdfb",
    border: "1px solid #d6e8e4",
    borderRadius: 20,
    boxShadow: "0 30px 60px -24px rgba(18,46,42,.6)",
    padding: "24px 26px",
    animation: "hg-modalIn .4s cubic-bezier(.2,.9,.3,1)",
    maxHeight: "88vh",
    overflowY: "auto",
  };
}

const modalKicker: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  color: "#7d918c",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

function Dots({ big, inline }: { big?: boolean; inline?: boolean }) {
  const s = big ? 8 : 5;
  const dot = (delay: string): React.CSSProperties => ({
    width: s,
    height: s,
    borderRadius: "50%",
    background: big ? "#bcd6d0" : ACCENT,
    display: "inline-block",
    animation: `hg-dotPulse 1.1s infinite ${delay}`,
  });
  return (
    <span style={{ display: "inline-flex", gap: big ? 5 : 4, marginLeft: inline ? 1 : 0 }}>
      <span style={dot("0s")} />
      <span style={dot(".22s")} />
      <span style={dot(".44s")} />
    </span>
  );
}

function IntroModal({ onStart }: { onStart: () => void }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  return (
    <div style={overlay("fixed")}>
      <div style={{ ...modalCard(520), padding: "26px 28px" }}>
        <div style={modalKicker}>how to play</div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: "-0.015em", margin: "8px 0 0" }}>
          Context Calibration
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#33433f", marginTop: 10 }}>
          A good answer starts with good <b>context</b>. Each round, a colleague sends a task and a{" "}
          <b>tray of candidate snippets</b>. Your job is to attach only the context the answer
          genuinely needs — then watch what the AI produces from your selection.
        </p>

        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            marginTop: 16,
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 42%, #d6e8e4)`,
            background: `color-mix(in srgb, ${ACCENT} 8%, #fffdfb)`,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>🎛️</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#33433f" }}>
            <b style={{ color: ACCENT }}>More is not better.</b> Some snippets are essential, some
            are harmless noise — and some are <b>plausible but misleading</b>, and attaching them
            will steer the answer wrong. Too little context starves the answer; too much{" "}
            <b>misdirects</b> it. Add enough signal, and no noise.
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #d6e8e4", borderRadius: 12, background: "#f6faf9", overflow: "hidden" }}>
          <div
            onClick={() => setRulesOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "12px 14px" }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#7d918c" }}>{rulesOpen ? "▾" : "▸"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#5d706b", textTransform: "uppercase" }}>
              Learning outcomes &amp; common rules
            </span>
          </div>
          {rulesOpen && (
            <div style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.5, color: "#33433f" }}>
              <p style={{ marginTop: 0, fontWeight: 600 }}>You&apos;ll practise:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>Choosing the context that actually improves an answer.</li>
                <li>Recognising that excess or irrelevant context misdirects the model.</li>
                <li>Calibrating — enough signal to ground the answer, no noise to derail it.</li>
              </ul>
              <p style={{ marginTop: 0, fontWeight: 600 }}>How you score:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li><b>Completeness</b> is the gate — attach the essential snippets or you can&apos;t clear.</li>
                <li><b>Focus</b> earns the rest — leaving out noise and misleading snippets; distractors hurt most.</li>
                <li>Attaching <i>everything</i> fails just like attaching too little.</li>
              </ul>
              <p style={{ marginTop: 0, fontWeight: 600 }}>Common arcade rules:</p>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                <li>Clear a round at <b>≥ 65%</b> to unlock the next level.</li>
                <li><b>≥ 70%</b> earns an XP bonus; <b>≥ 85%</b> earns a bigger one.</li>
                <li>Each game targets roughly <b>15 minutes</b> of play.</li>
              </ul>
            </div>
          )}
        </div>

        <button onClick={onStart} style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}>
          START ROUND 1 →
        </button>
      </div>
    </div>
  );
}

function statCard(border: string, bg: string, color: string, value: string, label: string) {
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 14, padding: "15px 16px", background: bg }}>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#5d706b", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Verdict({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: MONO,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: ".02em",
        color: ok ? GREEN : RED,
        background: ok ? "#eef7ec" : "#fdf1ee",
        border: `1px solid ${ok ? "#cfe6d4" : "#efd2c9"}`,
        borderRadius: 999,
        padding: "5px 12px",
      }}
    >
      {ok ? "✓" : "✕"} {label}
    </span>
  );
}

/** Per-snippet verdict: how the kind + the player's call combine. */
function itemVerdict(kind: ContextItemKind, selected: boolean): {
  ok: boolean;
  tone: "good" | "bad" | "warn" | "neutral";
  tag: string;
  note: string;
} {
  switch (kind) {
    case "essential":
      return selected
        ? { ok: true, tone: "good", tag: "essential", note: "kept the detail the answer needed" }
        : { ok: false, tone: "bad", tag: "essential", note: "left out — the answer was starved" };
    case "distractor":
      return selected
        ? { ok: false, tone: "bad", tag: "misleading", note: "attached — this steers the answer wrong" }
        : { ok: true, tone: "good", tag: "misleading", note: "rightly left out — it would have misled" };
    case "noise":
      return selected
        ? { ok: false, tone: "warn", tag: "irrelevant", note: "attached — harmless but just clutter" }
        : { ok: true, tone: "good", tag: "irrelevant", note: "rightly left out" };
    case "helpful":
    default:
      return { ok: true, tone: "neutral", tag: "nice to have", note: selected ? "attached — a fair extra" : "optional — fine to skip" };
  }
}

function Debrief({
  result,
  roundNo,
  total,
  isLast,
  onNext,
}: {
  result: ScoreResult;
  roundNo: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
}) {
  const cleared = result.score >= result.maxScore * 0.65;
  const gotEssentials = result.essentialsIncluded >= result.essentialsTotal;
  const avoidedDistractors = result.distractorIncluded === 0;

  return (
    <div
      style={{
        border: "1px solid #d6e8e4",
        borderRadius: 22,
        background: "#fffdfb",
        boxShadow: "0 22px 50px -28px rgba(20,60,55,.4)",
        padding: "26px 28px",
        animation: "hg-slideUp .5s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, letterSpacing: "-0.015em" }}>
          Round {roundNo} — debrief
        </div>
        <span style={chipStyle}>ROUND {roundNo} / {total}</span>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <Verdict ok={gotEssentials} label={gotEssentials ? "kept the essentials" : "missed an essential"} />
        <Verdict
          ok={avoidedDistractors}
          label={avoidedDistractors ? "no misleading context" : "attached misleading context"}
        />
        {result.exceptional && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 700,
              color: AMBER,
              background: "#fdf8ee",
              border: "1px solid #efe2c9",
              borderRadius: 999,
              padding: "5px 12px",
            }}
          >
            ★ exceptional
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 18 }}>
        {statCard(
          cleared ? "#cfe6d4" : "#efd2c9",
          cleared ? "#eef7ec" : "#fdf1ee",
          cleared ? GREEN : RED,
          `${Math.round((result.score / result.maxScore) * 100)}%`,
          cleared ? "round cleared" : "below clear",
        )}
        {statCard("#d6e8e4", "#f6faf9", "#1c2422", `${result.completeness}%`, "completeness (the gate)")}
        {statCard("#d6e8e4", "#f6faf9", "#1c2422", `${result.focus}%`, "focus (no noise)")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: GREEN, fontWeight: 700 }}>+{result.xpEarned} XP</span>
        {result.bonusXp > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, color: AMBER, fontWeight: 700 }}>+{result.bonusXp} bonus ★</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#5d706b" }}>
          level {result.player.level} · {result.player.xp} XP
        </span>
      </div>

      {/* what it produced */}
      <div style={{ ...kicker, marginTop: 24 }}>What your context produced</div>
      <div
        style={{
          fontSize: 14.5,
          lineHeight: 1.55,
          marginTop: 10,
          border: "1px solid #d6e8e4",
          borderRadius: 14,
          padding: "14px 16px",
          background: "#f6faf9",
          color: "#33433f",
          whiteSpace: "pre-wrap",
        }}
      >
        {result.output}
      </div>

      {/* per-snippet breakdown */}
      <div style={{ ...kicker, marginTop: 24 }}>The tray, reviewed</div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 9 }}>
        {result.items.map((it) => {
          const v = itemVerdict(it.kind, it.selected);
          const toneColor =
            v.tone === "good" ? GREEN : v.tone === "bad" ? RED : v.tone === "warn" ? AMBER : "#5d706b";
          const toneBg =
            v.tone === "good" ? "#eef7ec" : v.tone === "bad" ? "#fdf1ee" : v.tone === "warn" ? "#fdf8ee" : "#f6faf9";
          const toneBorder =
            v.tone === "good" ? "#cfe6d4" : v.tone === "bad" ? "#efd2c9" : v.tone === "warn" ? "#efe2c9" : "#d6e8e4";
          return (
            <div
              key={it.id}
              style={{
                display: "flex",
                gap: 11,
                alignItems: "flex-start",
                border: `1px solid ${toneBorder}`,
                background: toneBg,
                borderRadius: 12,
                padding: "11px 14px",
              }}
            >
              <span style={{ flex: "none", fontSize: 15, color: toneColor, marginTop: 1 }}>
                {v.ok ? "✓" : "✕"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: ".04em",
                      textTransform: "uppercase",
                      color: toneColor,
                      border: `1px solid ${toneBorder}`,
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    {v.tag}
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: ".04em",
                      color: it.selected ? ACCENT : "#a7b8b3",
                    }}
                  >
                    {it.selected ? "you attached" : "you left out"}
                  </span>
                </div>
                <div style={{ fontSize: 14.5, color: "#1c2422", marginTop: 4 }}>{it.text}</div>
                <div style={{ fontSize: 13.5, color: "#5d706b", marginTop: 4, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 700, color: toneColor }}>{v.note}.</span>
                  {it.reason ? ` ${it.reason}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* why */}
      <div style={{ marginTop: 16, borderLeft: `3px solid ${ACCENT}`, padding: "2px 0 2px 13px", color: "#33433f", fontSize: 15, lineHeight: 1.5 }}>
        {result.explanation}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
        <button onClick={onNext} style={{ ...primaryBtn, padding: "13px 24px" }}>
          {isLast ? "SEE SUMMARY →" : "NEXT ROUND →"}
        </button>
        <Link href="/" style={{ ...backChip, padding: "13px 20px", borderRadius: 12 }}>
          BACK TO ARCADE
        </Link>
      </div>
    </div>
  );
}

function buildImprovementHints(history: HistoryEntry[]): string[] {
  if (history.length === 0) return [];
  const missedEssentials = history.filter((h) => h.completeness < 100).length;
  const lostFocus = history.filter((h) => h.focus < 100).length;
  const hints: string[] = [];
  if (missedEssentials > 0) {
    hints.push(
      `You left out an essential snippet on ${missedEssentials} round${missedEssentials === 1 ? "" : "s"} — completeness is the gate; without the detail the answer needs, it can only guess.`,
    );
  }
  if (lostFocus > 0) {
    hints.push(
      `Noise or misleading context crept in on ${lostFocus} round${lostFocus === 1 ? "" : "s"} — attaching a plausible-but-wrong snippet steers the answer off course. When in doubt, leave it out.`,
    );
  }
  hints.push(
    "The skill is calibration: add the context the answer genuinely needs, and resist piling on the rest.",
  );
  return hints.slice(0, 3);
}

function FinalSummary({
  history,
  total,
  onReplay,
}: {
  history: HistoryEntry[];
  total: number;
  onReplay: () => void;
}) {
  const avg = history.length
    ? Math.round(history.reduce((n, h) => n + h.score, 0) / history.length)
    : 0;
  const totalXp = history.reduce((n, h) => n + h.xp, 0);
  const cleared = history.filter((h) => h.score >= 65).length;
  const perfect = history.filter((h) => h.exceptional).length;
  const hints = avg < 90 ? buildImprovementHints(history) : [];

  return (
    <div style={overlay("fixed")}>
      <div style={{ ...modalCard(540), padding: "30px 28px", textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#7d918c", textTransform: "uppercase" }}>
          game complete
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
          {avg >= 85 ? "Context Curator 🏆" : avg >= 65 ? "Well calibrated 🎛️" : "Keep practising 🔁"}
        </h2>
        <p style={{ fontSize: 15.5, color: "#5d706b", marginTop: 6 }}>
          You cleared <b style={{ color: "#1c2422" }}>{cleared} of {total}</b> rounds, with{" "}
          <b style={{ color: "#1c2422" }}>{perfect}</b> perfect.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 20, textAlign: "left" }}>
          {statCard("#d6e8e4", "#f6faf9", "#1c2422", `${avg}%`, "average score")}
          {statCard("#cfe6d4", "#eef7ec", GREEN, `${cleared}/${total}`, "rounds cleared (≥65%)")}
          {statCard("#efe2c9", "#fdf8ee", AMBER, `+${totalXp}`, "XP earned")}
        </div>

        {hints.length > 0 ? (
          <div style={{ marginTop: 22, border: "1.5px solid color-mix(in srgb, var(--accent) 32%, #d6e8e4)", background: "color-mix(in srgb, var(--accent) 6%, #fffdfb)", borderRadius: 16, padding: "16px 18px", textAlign: "left" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: ACCENT, textTransform: "uppercase", marginBottom: 10 }}>
              How to improve
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {hints.map((h, i) => (
                <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, color: "#33433f" }}>{h}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ fontSize: 14.5, color: GREEN, fontWeight: 600, marginTop: 18 }}>
            Sharp curation — you fed the answer exactly what it needed and nothing that would mislead it.
          </p>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={onReplay} style={primaryBtn}>↻ PLAY AGAIN</button>
          <Link href="/" style={{ ...backChip, padding: "12px 20px", borderRadius: 12 }}>
            BACK TO ARCADE
          </Link>
        </div>
      </div>
    </div>
  );
}
