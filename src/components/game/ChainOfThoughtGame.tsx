"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { VideoPlaceholder } from "./VideoExplainer";
import { EXPLAINER_SCRIPTS } from "@/lib/game-explainer-scripts";

const ACCENT = "#6c5ce0";
const DISPLAY = "var(--font-bricolage), sans-serif";
const BODY = "var(--font-hanken), system-ui, sans-serif";
const MONO = "var(--font-space-mono), monospace";
const GREEN = "#1f8a5b";
const RED = "#c0563a";

export interface RoundRef {
  id: string;
  difficulty: number;
}

interface Option {
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
  question: string;
  options: Option[];
  snapAnswerId: string;
  snapAnswerText: string;
  reasoning: string[];
}

interface ScoreResult {
  score: number;
  maxScore: number;
  accuracy: boolean;
  judgment: boolean;
  trusted: boolean;
  snapCorrect: boolean;
  chosenOptionId: string;
  correctOptionId: string;
  snapAnswerId: string;
  options: Option[];
  reasoning: string[];
  explanation: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "modal" | "snap" | "thinking" | "commit";
type Decision = "trust" | "think";

interface HistoryEntry {
  score: number;
  xp: number;
  accuracy: boolean;
  judgment: boolean;
}

export function ChainOfThoughtGame({ rounds }: { rounds: RoundRef[] }) {
  const router = useRouter();
  const total = rounds.length || 5;

  const [roundIndex, setRoundIndex] = useState(0);
  const [screen, setScreen] = useState<"play" | "results" | "summary">("play");
  const [phase, setPhase] = useState<Phase>("intro");
  const [scenario, setScenario] = useState<SafeScenario | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [decision, setDecision] = useState<Decision | null>(null);
  const [reasonCount, setReasonCount] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
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
        const res = await fetch("/api/games/chain-of-thought/generate", {
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

  // ---- timers ----
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  // ---- reasoning reveal animation ----
  const startThinking = useCallback(
    (sc: SafeScenario) => {
      setPhase("thinking");
      setReasonCount(0);
      const n = sc.reasoning.length;
      for (let i = 1; i <= n; i++) {
        schedule(() => setReasonCount(i), 780 * i);
      }
      schedule(() => setPhase("commit"), 780 * n + 550);
    },
    [schedule],
  );

  const chooseDecision = useCallback(
    (choice: Decision) => {
      if (!scenario) return;
      clearTimers();
      setDecision(choice);
      startThinking(scenario);
    },
    [scenario, clearTimers, startThinking],
  );

  const skipThinking = useCallback(() => {
    if (!scenario) return;
    clearTimers();
    setReasonCount(scenario.reasoning.length);
    setPhase("commit");
  }, [scenario, clearTimers]);

  // ---- round loading ----
  const loadRound = useCallback(
    async (index: number) => {
      clearTimers();
      const round = rounds[index];
      if (!round) return;
      setScreen("play");
      setPhase("loading");
      setScenario(null);
      setRoundId(null);
      setResult(null);
      setDecision(null);
      setReasonCount(0);
      setChosen(null);
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
    [rounds, clearTimers, prefetchRound],
  );

  const submit = useCallback(async () => {
    if (!roundId || !chosen || !decision) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/games/chain-of-thought/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId,
          trusted: decision === "trust",
          chosenOptionId: chosen,
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
          accuracy: data.accuracy,
          judgment: data.judgment,
        },
      ]);
      setScreen("results");
      router.refresh();
    } catch {
      setLoadError("Could not submit — try again.");
    } finally {
      setSubmitting(false);
    }
  }, [roundId, chosen, decision, router]);

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
    clearTimers();
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
    setDecision(null);
    setReasonCount(0);
    setChosen(null);
  }, [clearTimers]);

  // ---- derived ----
  const reasonList = scenario?.reasoning.slice(0, reasonCount) ?? [];
  const snapOption = scenario?.options.find((o) => o.id === scenario.snapAnswerId);
  const showReasoning = phase === "thinking" || phase === "commit";
  const thinking = phase === "thinking";

  // ===================== RENDER =====================
  const pageStyle: React.CSSProperties = {
    ["--accent" as string]: ACCENT,
    minHeight: "100vh",
    background: "radial-gradient(120% 80% at 80% -10%, #f3f1fb 0%, #ece9f6 55%)",
    fontFamily: BODY,
    color: "#211f1a",
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
            borderBottom: "1px solid #ddd7ee",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                textDecoration: "none",
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: ".04em",
                color: "#6a6580",
                border: "1px solid #ddd7ee",
                background: "#faf8ff",
                padding: "7px 12px",
                borderRadius: 9,
                whiteSpace: "nowrap",
              }}
            >
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
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, #e6e1f4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3a5 5 0 0 1 5 5c0 1.3-.5 2.3-1.2 3.2.8.9 1.2 1.9 1.2 3.3a5 5 0 0 1-10 0c0-1.4.4-2.4 1.2-3.3C7.5 10.3 7 9.3 7 8a5 5 0 0 1 5-5Z"
                    stroke="#211f1a"
                    strokeWidth="1.8"
                  />
                  <line x1="12" y1="6.5" x2="12" y2="18" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
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
                Think It Through
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
              border: "1px solid #e4dff3",
              borderRadius: 22,
              background: "#fffdfb",
              boxShadow: "0 22px 50px -28px rgba(48,40,86,.4)",
              overflow: "hidden",
            }}
          >
            {/* task header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "15px 20px",
                borderBottom: "1px solid #efebfa",
                background: "#faf8ff",
              }}
            >
              <div style={diamondAvatar(38)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 4a5 5 0 0 1 3.8 8.2c-.5.6-.8 1.1-.8 1.8v.5H9v-.5c0-.7-.3-1.2-.8-1.8A5 5 0 0 1 12 4Z"
                    fill={ACCENT}
                  />
                  <rect x="9" y="16" width="6" height="2.4" rx="1.2" fill={ACCENT} />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
                  Work Assistant
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#9a94a8", letterSpacing: ".02em" }}>
                  {phase === "snap"
                    ? "Quick draft — answers instantly, no working"
                    : showReasoning
                      ? "Reasoning mode — thinking step by step"
                      : "connected to your workspace"}
                </div>
              </div>
              {phase === "thinking" && (
                <button onClick={skipThinking} style={skipBtn}>
                  SKIP ⏭
                </button>
              )}
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
                    color: "#9a94a8",
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

              {scenario && phase !== "loading" && phase !== "modal" && (
                <>
                  {/* the task */}
                  <div
                    style={{
                      border: "1px solid #efebfa",
                      borderRadius: 14,
                      background: "#faf8ff",
                      padding: "14px 16px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: "#9a94a8",
                        marginBottom: 7,
                      }}
                    >
                      the task · from {scenario.task.senderName}
                    </div>
                    <div style={{ fontSize: 15.5, lineHeight: 1.55, color: "#3a3550" }}>
                      {scenario.task.message}
                    </div>
                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 15.5,
                        fontWeight: 700,
                        color: "#211f1a",
                      }}
                    >
                      {scenario.question}
                    </div>
                  </div>

                  {/* quick draft snap answer */}
                  <div style={{ display: "flex", gap: 12, animation: "hg-slideUp .4s ease" }}>
                    <div style={{ ...diamondAvatar(34), flex: "none", background: "#3a3550" }}>
                      <span style={{ fontSize: 16 }}>⚡</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: ".04em",
                          color: "#9a94a8",
                          marginBottom: 5,
                        }}
                      >
                        QUICK DRAFT — instant answer
                      </div>
                      <div
                        style={{
                          fontSize: 17,
                          lineHeight: 1.5,
                          background: "#211f1a",
                          color: "#f4f0ff",
                          borderRadius: "5px 16px 16px 16px",
                          padding: "13px 16px",
                          display: "inline-block",
                        }}
                      >
                        {scenario.snapAnswerText}
                      </div>
                    </div>
                  </div>

                  {/* DECISION A — trust or think? */}
                  {phase === "snap" && (
                    <div
                      style={{
                        animation: "hg-slideUp .45s ease",
                        border: `1.5px solid color-mix(in srgb, var(--accent) 38%, #e4dff3)`,
                        background: `color-mix(in srgb, var(--accent) 7%, #fffdfb)`,
                        borderRadius: 16,
                        padding: "18px 20px",
                      }}
                    >
                      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20, lineHeight: 1.1 }}>
                        It answered instantly. Do you trust it?
                      </div>
                      <div style={{ fontSize: 14, color: "#6a6580", lineHeight: 1.45, marginTop: 5 }}>
                        A quick model answers from the gut. For multi-step work, the working is
                        where mistakes hide — but not every task needs it.
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                        <button onClick={() => chooseDecision("trust")} style={secondaryBtn}>
                          ✓ Accept this answer
                        </button>
                        <button onClick={() => chooseDecision("think")} style={primaryBtn}>
                          🧠 Make it think it through →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* reasoning panel */}
                  {showReasoning && (
                    <div style={{ display: "flex", gap: 12, animation: "hg-slideUp .4s ease" }}>
                      <div style={{ ...diamondAvatar(34), flex: "none" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M12 4a5 5 0 0 1 3.8 8.2c-.5.6-.8 1.1-.8 1.8v.5H9v-.5c0-.7-.3-1.2-.8-1.8A5 5 0 0 1 12 4Z"
                            fill="#fff"
                          />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: ".04em",
                            color: ACCENT,
                            marginBottom: 8,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {decision === "trust" ? "LET'S CHECK ITS WORKING" : "THINKING IT THROUGH"}
                          {thinking && <Dots inline />}
                        </div>
                        <div
                          style={{
                            border: "1px solid #e4dff3",
                            borderRadius: 14,
                            background: "#faf8ff",
                            padding: "13px 16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 11,
                          }}
                        >
                          {reasonList.map((r, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                gap: 11,
                                fontSize: 14.5,
                                lineHeight: 1.45,
                                color: "#4a4560",
                                animation: "hg-popIn .35s ease",
                              }}
                            >
                              <span
                                style={{
                                  flex: "none",
                                  width: 20,
                                  height: 20,
                                  borderRadius: "50%",
                                  background: "color-mix(in srgb, var(--accent) 16%, #fff)",
                                  color: ACCENT,
                                  fontFamily: MONO,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {i + 1}
                              </span>
                              <span>{r}</span>
                            </div>
                          ))}
                          {thinking && reasonList.length === 0 && (
                            <div style={{ padding: "4px 0" }}>
                              <Dots big />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DECISION B — commit the answer */}
                  {phase === "commit" && (
                    <div style={{ animation: "hg-slideUp .45s ease" }}>
                      <div
                        style={{
                          fontFamily: DISPLAY,
                          fontWeight: 700,
                          fontSize: 20,
                          lineHeight: 1.1,
                          marginBottom: 4,
                        }}
                      >
                        Your call — commit the final answer.
                      </div>
                      <div style={{ fontSize: 14, color: "#6a6580", lineHeight: 1.45, marginBottom: 14 }}>
                        You&apos;ve seen the working. Pick the answer you&apos;ll stand behind — you
                        stay accountable for the call.
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {scenario.options.map((o) => {
                          const isChosen = chosen === o.id;
                          const isSnap = o.id === scenario.snapAnswerId;
                          return (
                            <button
                              key={o.id}
                              onClick={() => setChosen(o.id)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                textAlign: "left",
                                fontFamily: BODY,
                                fontSize: 15.5,
                                color: "#211f1a",
                                background: isChosen
                                  ? "color-mix(in srgb, var(--accent) 12%, #fff)"
                                  : "#fff",
                                border: `1.5px solid ${isChosen ? ACCENT : "#e4dff3"}`,
                                borderRadius: 13,
                                padding: "13px 15px",
                                cursor: "pointer",
                                transition: "border-color .14s, background .14s",
                              }}
                            >
                              <span
                                style={{
                                  flex: "none",
                                  width: 20,
                                  height: 20,
                                  borderRadius: "50%",
                                  border: `2px solid ${isChosen ? ACCENT : "#cfc8e4"}`,
                                  background: isChosen ? ACCENT : "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#fff",
                                  fontSize: 12,
                                }}
                              >
                                {isChosen ? "✓" : ""}
                              </span>
                              <span style={{ flex: 1 }}>{o.text}</span>
                              {isSnap && (
                                <span
                                  style={{
                                    fontFamily: MONO,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: ".04em",
                                    color: "#9a94a8",
                                    border: "1px solid #e4dff3",
                                    borderRadius: 999,
                                    padding: "3px 8px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  ⚡ QUICK DRAFT&apos;S PICK
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}>
                        <button
                          onClick={submit}
                          disabled={submitting || !chosen}
                          style={{
                            ...primaryBtn,
                            opacity: submitting || !chosen ? 0.5 : 1,
                            cursor: submitting || !chosen ? "default" : "pointer",
                          }}
                        >
                          {submitting ? "SCORING…" : "LOCK IN ANSWER →"}
                        </button>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: "#9a94a8" }}>
                          {decision === "trust"
                            ? "you accepted the quick answer"
                            : "you asked it to reason it out"}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* TASK MODAL */}
            {phase === "modal" && scenario && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(40,34,70,.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 26,
                  zIndex: 50,
                  overflowY: "auto",
                  animation: "hg-overlayIn .25s ease",
                }}
              >
                <div
                  style={{
                    maxWidth: 440,
                    width: "100%",
                    background: "#fffdfb",
                    border: "1px solid #e4dff3",
                    borderRadius: 20,
                    boxShadow: "0 30px 60px -24px rgba(40,34,70,.6)",
                    padding: "24px 26px",
                    maxHeight: "86vh",
                    overflowY: "auto",
                    animation: "hg-modalIn .4s cubic-bezier(.2,.9,.3,1)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#9a94a8",
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                    }}
                  >
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
                        background: "linear-gradient(135deg,#6c5ce0,#9b8cf0)",
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
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#9a94a8" }}>
                        {scenario.task.senderRole}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      lineHeight: 1.55,
                      marginTop: 16,
                      border: "1px solid #e4dff3",
                      borderRadius: 14,
                      padding: "14px 16px",
                      background: "#faf8ff",
                      color: "#3a3550",
                    }}
                  >
                    {scenario.task.message}
                  </div>
                  <button
                    onClick={() => setPhase("snap")}
                    style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}
                  >
                    SEE THE QUICK ANSWER →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== DEBRIEF ===== */}
        {screen === "results" && result && scenario && (
          <Debrief
            result={result}
            scenario={scenario}
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
  color: "#6a6580",
  background: "#faf8ff",
  border: "1px solid #ddd7ee",
  padding: "7px 12px",
  borderRadius: 9,
  whiteSpace: "nowrap",
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

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: ".04em",
  color: "#4a4560",
  background: "#fff",
  border: "1px solid #ddd7ee",
  padding: "12px 20px",
  borderRadius: 11,
  cursor: "pointer",
};

const skipBtn: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".03em",
  color: "#9a94a8",
  background: "#fff",
  border: "1px solid #e4dff3",
  padding: "6px 11px",
  borderRadius: 8,
  cursor: "pointer",
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

function Dots({ big, inline }: { big?: boolean; inline?: boolean }) {
  const s = big ? 8 : 5;
  const dot = (delay: string): React.CSSProperties => ({
    width: s,
    height: s,
    borderRadius: "50%",
    background: big ? "#c8c0e4" : ACCENT,
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
    <div
      style={{
        ["--accent" as string]: ACCENT,
        position: "fixed",
        inset: 0,
        background: "rgba(40,34,70,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 26,
        zIndex: 50,
        animation: "hg-overlayIn .25s ease",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          width: "100%",
          background: "#fffdfb",
          border: "1px solid #e4dff3",
          borderRadius: 20,
          boxShadow: "0 30px 60px -24px rgba(40,34,70,.6)",
          padding: "26px 28px",
          animation: "hg-modalIn .4s cubic-bezier(.2,.9,.3,1)",
          maxHeight: "86vh",
          overflowY: "auto",
          display: "flex",
          gap: 24,
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        <VideoPlaceholder script={EXPLAINER_SCRIPTS["chain-of-thought"]} accent={ACCENT} />
        <div style={{ flex: "1 1 380px", minWidth: 0 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            color: "#9a94a8",
            textTransform: "uppercase",
            letterSpacing: ".06em",
          }}
        >
          how to play
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: "-0.015em", margin: "8px 0 0" }}>
          Think It Through
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#3a3550", marginTop: 10 }}>
          Modern AI can <b>reason through</b> the multi-step work people used to grind out by
          hand. Each round, a colleague sends a task and a <b>quick model blurts an instant
          answer</b>. Your job isn&apos;t to do the steps — it&apos;s to decide whether to trust
          that snap answer or make the AI <b>think it through</b>, then commit the final call.
        </p>

        {/* two-step badge */}
        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            marginTop: 16,
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 42%, #e4dff3)`,
            background: `color-mix(in srgb, ${ACCENT} 8%, #fffdfb)`,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>🧠</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#3a3550" }}>
            <b style={{ color: ACCENT }}>Two calls each round.</b> First: trust the quick answer,
            or demand the working? On a simple task the snap answer is often fine; on multi-step
            work it skips a step and falls for a trap. Then, after you&apos;ve read the
            step-by-step reasoning, <b>commit the answer you&apos;ll stand behind.</b>
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #e4dff3", borderRadius: 12, background: "#faf8ff", overflow: "hidden" }}>
          <div
            onClick={() => setRulesOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "12px 14px" }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#9a94a8" }}>{rulesOpen ? "▾" : "▸"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#6a6580", textTransform: "uppercase" }}>
              Learning outcomes &amp; common rules
            </span>
          </div>
          {rulesOpen && (
            <div style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.5, color: "#3a3550" }}>
              <p style={{ marginTop: 0, fontWeight: 600 }}>You&apos;ll practise:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>Recognising that AI can reason through multi-step work you used to do by hand.</li>
                <li>Calibrating when a quick answer is enough vs when to demand the working.</li>
                <li>Reading a chain of thought and staying accountable for the final call.</li>
              </ul>
              <p style={{ marginTop: 0, fontWeight: 600 }}>How you score:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>The <b>final answer</b> is the gate — get it right and you clear the round.</li>
                <li>A correct <b>trust call</b> on top earns the XP bonus, and both right is a perfect round.</li>
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
    </div>
  );
}

function statCard(border: string, bg: string, color: string, value: string, label: string) {
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 14, padding: "15px 16px", background: bg }}>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#6a6560", marginTop: 2 }}>{label}</div>
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

function Debrief({
  result,
  scenario,
  roundNo,
  total,
  isLast,
  onNext,
}: {
  result: ScoreResult;
  scenario: SafeScenario;
  roundNo: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
}) {
  const optionText = (id: string) =>
    result.options.find((o) => o.id === id)?.text ?? scenario.options.find((o) => o.id === id)?.text ?? "—";
  const cleared = result.score >= result.maxScore * 0.65;

  return (
    <div
      style={{
        border: "1px solid #e4dff3",
        borderRadius: 22,
        background: "#fffdfb",
        boxShadow: "0 22px 50px -28px rgba(48,40,86,.4)",
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
        <Verdict ok={result.accuracy} label={result.accuracy ? "right answer" : "wrong answer"} />
        <Verdict
          ok={result.judgment}
          label={
            result.judgment
              ? result.trusted
                ? "good call — quick answer held"
                : "good call — needed the working"
              : result.trusted
                ? "trusted a wrong snap"
                : "demanded needless working"
          }
        />
        {result.exceptional && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 700,
              color: "#c9933f",
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
        <span style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 13, color: GREEN, fontWeight: 700 }}>+{result.xpEarned} XP</span>
          {result.bonusXp > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 13, color: "#c9933f", fontWeight: 700 }}>+{result.bonusXp} bonus ★</span>
          )}
          <span style={{ fontFamily: MONO, fontSize: 12, color: "#6a6580" }}>
            level {result.player.level} · {result.player.xp} XP
          </span>
        </span>
        {statCard(
          "#e4dff3",
          "#faf8ff",
          "#211f1a",
          result.snapCorrect ? "✓" : "✕",
          result.snapCorrect ? "the quick answer was right" : "the quick answer was wrong",
        )}
      </div>

      {/* answers */}
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#9a94a8", textTransform: "uppercase", marginTop: 24 }}>
        The answers
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <AnswerRow label="Correct answer" text={optionText(result.correctOptionId)} tone="good" />
        <AnswerRow
          label="Quick draft's snap"
          text={optionText(result.snapAnswerId)}
          tone={result.snapCorrect ? "good" : "bad"}
        />
        <AnswerRow
          label="Your answer"
          text={optionText(result.chosenOptionId)}
          tone={result.accuracy ? "good" : "bad"}
        />
      </div>

      {/* reasoning */}
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#9a94a8", textTransform: "uppercase", marginTop: 24 }}>
        The working
      </div>
      <div style={{ marginTop: 10, border: "1px solid #e4dff3", borderRadius: 14, background: "#faf8ff", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {result.reasoning.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 11, fontSize: 14.5, lineHeight: 1.45, color: "#4a4560" }}>
            <span
              style={{
                flex: "none",
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "color-mix(in srgb, #6c5ce0 16%, #fff)",
                color: ACCENT,
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {i + 1}
            </span>
            <span>{r}</span>
          </div>
        ))}
      </div>

      {/* why */}
      <div style={{ marginTop: 16, borderLeft: `3px solid ${ACCENT}`, padding: "2px 0 2px 13px", color: "#3a3550", fontSize: 15, lineHeight: 1.5 }}>
        {result.explanation}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
        <button onClick={onNext} style={{ ...primaryBtn, padding: "13px 24px" }}>
          {isLast ? "SEE SUMMARY →" : "NEXT ROUND →"}
        </button>
        <Link
          href="/"
          style={{
            textDecoration: "none",
            fontFamily: MONO,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: ".04em",
            color: "#6a6580",
            background: "#faf8ff",
            border: "1px solid #ddd7ee",
            padding: "13px 20px",
            borderRadius: 12,
          }}
        >
          BACK TO ARCADE
        </Link>
      </div>
    </div>
  );
}

function AnswerRow({ label, text, tone }: { label: string; text: string; tone: "good" | "bad" }) {
  const ok = tone === "good";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: `1px solid ${ok ? "#cfe6d4" : "#efd2c9"}`,
        background: ok ? "#eef7ec" : "#fdf1ee",
        borderRadius: 12,
        padding: "11px 14px",
      }}
    >
      <span style={{ fontSize: 15, color: ok ? GREEN : RED }}>{ok ? "✓" : "✕"}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".03em", color: "#6a6560", textTransform: "uppercase", minWidth: 116 }}>
        {label}
      </span>
      <span style={{ fontSize: 15, color: "#211f1a" }}>{text}</span>
    </div>
  );
}

function buildImprovementHints(history: HistoryEntry[]): string[] {
  if (history.length === 0) return [];
  const wrongAnswers = history.filter((h) => !h.accuracy).length;
  const wrongJudgment = history.filter((h) => !h.judgment).length;
  const hints: string[] = [];
  if (wrongAnswers > 0) {
    hints.push(
      `You committed the wrong answer on ${wrongAnswers} round${wrongAnswers === 1 ? "" : "s"} — read the chain of thought to the end before locking in; the snap answer often skips the final step.`,
    );
  }
  if (wrongJudgment > 0) {
    hints.push(
      `Your trust call was off on ${wrongJudgment} round${wrongJudgment === 1 ? "" : "s"} — a quick answer is fine for one-step tasks, but multi-step work (weekend skips, layered rules, several sums) needs the working.`,
    );
  }
  hints.push(
    "The point isn't to distrust AI — it's to know when to make it show its reasoning, then verify the result yourself.",
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
  const perfect = history.filter((h) => h.accuracy && h.judgment).length;
  const hints = avg < 90 ? buildImprovementHints(history) : [];

  return (
    <div
      style={{
        ["--accent" as string]: ACCENT,
        position: "fixed",
        inset: 0,
        background: "rgba(40,34,70,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 26,
        zIndex: 50,
        animation: "hg-overlayIn .25s ease",
      }}
    >
      <div
        style={{
          maxWidth: 540,
          width: "100%",
          background: "#fffdfb",
          border: "1px solid #e4dff3",
          borderRadius: 20,
          boxShadow: "0 30px 60px -24px rgba(40,34,70,.6)",
          padding: "30px 28px",
          animation: "hg-modalIn .4s cubic-bezier(.2,.9,.3,1)",
          maxHeight: "88vh",
          overflowY: "auto",
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#9a94a8", textTransform: "uppercase" }}>
          game complete
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
          {avg >= 85 ? "Clear Thinker 🏆" : avg >= 65 ? "Good instincts 🧠" : "Keep practising 🔁"}
        </h2>
        <p style={{ fontSize: 15.5, color: "#6a6580", marginTop: 6 }}>
          You cleared <b style={{ color: "#211f1a" }}>{cleared} of {total}</b> rounds, with{" "}
          <b style={{ color: "#211f1a" }}>{perfect}</b> perfect.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 20, textAlign: "left" }}>
          {statCard("#e4dff3", "#faf8ff", "#211f1a", `${avg}%`, "average score")}
          {statCard("#cfe6d4", "#eef7ec", GREEN, `${cleared}/${total}`, "rounds cleared (≥65%)")}
          {statCard("#efe2c9", "#fdf8ee", "#c9933f", `+${totalXp}`, "XP earned")}
        </div>

        {hints.length > 0 ? (
          <div style={{ marginTop: 22, border: "1.5px solid color-mix(in srgb, var(--accent) 32%, #e4dff3)", background: "color-mix(in srgb, var(--accent) 6%, #fffdfb)", borderRadius: 16, padding: "16px 18px", textAlign: "left" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: ACCENT, textTransform: "uppercase", marginBottom: 10 }}>
              How to improve
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {hints.map((h, i) => (
                <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, color: "#3a3550" }}>{h}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ fontSize: 14.5, color: GREEN, fontWeight: 600, marginTop: 18 }}>
            Sharp work — you knew when to trust the snap and when to demand the working.
          </p>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={onReplay} style={primaryBtn}>↻ PLAY AGAIN</button>
          <Link
            href="/"
            style={{
              textDecoration: "none",
              fontFamily: MONO,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: ".04em",
              color: "#6a6580",
              background: "#faf8ff",
              border: "1px solid #ddd7ee",
              padding: "12px 20px",
              borderRadius: 12,
            }}
          >
            BACK TO ARCADE
          </Link>
        </div>
      </div>
    </div>
  );
}
