"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { StepKind } from "@/lib/checkpoint-placement-scoring";
import type { RiskTier } from "@/lib/checkpoint-tiers";

const ACCENT = "#4c63d2";
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

interface Step {
  id: string;
  title: string;
  detail: string;
  impact: string;
}
interface SafeScenario {
  topic: string;
  riskTier: RiskTier;
  workflowName: string;
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  goal: string;
  steps: Step[];
}

interface ResultStep {
  id: string;
  title: string;
  detail: string;
  impact: string;
  kind: StepKind;
  checkpointed: boolean;
}

interface ScoreResult {
  score: number;
  maxScore: number;
  coverage: number;
  efficiency: number;
  criticalTotal: number;
  criticalCheckpointed: number;
  overChecked: number;
  missedCritical: boolean;
  steps: ResultStep[];
  workflowName: string;
  goal: string;
  riskTier: RiskTier;
  output: string;
  explanation: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "modal" | "place";

interface HistoryEntry {
  score: number;
  xp: number;
  coverage: number;
  efficiency: number;
  exceptional: boolean;
}

const RISK_LABEL: Record<RiskTier, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

export function CheckpointPlacementGame({ rounds }: { rounds: RoundRef[] }) {
  const router = useRouter();
  const total = rounds.length || 5;

  const [roundIndex, setRoundIndex] = useState(0);
  const [screen, setScreen] = useState<"play" | "results" | "summary">("play");
  const [phase, setPhase] = useState<Phase>("intro");
  const [scenario, setScenario] = useState<SafeScenario | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [checkpointed, setCheckpointed] = useState<Set<string>>(new Set());
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
        const res = await fetch("/api/games/checkpoint-placement/generate", {
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
      setCheckpointed(new Set());
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

  const toggleStep = useCallback((id: string) => {
    setCheckpointed((prev) => {
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
      const res = await fetch("/api/games/checkpoint-placement/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId,
          checkpointedIds: [...checkpointed],
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
          coverage: data.coverage,
          efficiency: data.efficiency,
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
  }, [roundId, checkpointed, router]);

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
    setCheckpointed(new Set());
  }, []);

  // ===================== RENDER =====================
  const pageStyle: React.CSSProperties = {
    ["--accent" as string]: ACCENT,
    minHeight: "100vh",
    background: "radial-gradient(120% 80% at 80% -10%, #eef0fb 0%, #e6eafa 55%)",
    fontFamily: BODY,
    color: "#1c2030",
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
            borderBottom: "1px solid #d4daf2",
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
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, #d8def4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3v18M5 8l7-5 7 5"
                    stroke="#1c2030"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="14" r="3.1" stroke={ACCENT} strokeWidth="1.8" />
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
                In the Loop
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
              border: "1px solid #d8def4",
              borderRadius: 22,
              background: "#fffdfb",
              boxShadow: "0 22px 50px -28px rgba(30,36,80,.4)",
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
                borderBottom: "1px solid #e7eafb",
                background: "#f6f7fd",
              }}
            >
              <div style={diamondAvatar(38)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3 4 7v5c0 4.5 3.2 7.5 8 9 4.8-1.5 8-4.5 8-9V7l-8-4Z" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
                  {scenario ? scenario.workflowName : "Workflow"}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#7c84a4", letterSpacing: ".02em" }}>
                  place a human checkpoint only where it's truly needed
                </div>
              </div>
              {scenario && phase === "place" && (
                <span style={riskBadge(scenario.riskTier)}>
                  {RISK_LABEL[scenario.riskTier]}
                </span>
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
                    color: "#7c84a4",
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
                      <div style={{ marginTop: 12 }}>Building the workflow…</div>
                    </>
                  )}
                </div>
              )}

              {scenario && phase === "place" && (
                <>
                  {/* the goal */}
                  <div
                    style={{
                      border: "1px solid #e7eafb",
                      borderRadius: 14,
                      background: "#f6f7fd",
                      padding: "14px 16px",
                    }}
                  >
                    <div style={kicker}>the goal · from {scenario.brief.senderName}</div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: "#1c2030" }}>
                      🎯 {scenario.goal}
                    </div>
                  </div>

                  {/* pipeline */}
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <div style={kicker}>the workflow · tap a step to require human review before it runs</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#7c84a4", whiteSpace: "nowrap" }}>
                      {checkpointed.size} checkpoint{checkpointed.size === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {scenario.steps.map((s, i) => {
                      const on = checkpointed.has(s.id);
                      const last = i === scenario.steps.length - 1;
                      return (
                        <div key={s.id} style={{ display: "flex", gap: 12 }}>
                          {/* rail */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: 26 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: on ? ACCENT : "#eef0fb",
                                border: `2px solid ${on ? ACCENT : "#cdd5f0"}`,
                                color: on ? "#fff" : "#7c84a4",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: MONO,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {i + 1}
                            </div>
                            {!last && (
                              <div style={{ flex: 1, width: 2, background: "#dfe4f7", minHeight: 14 }} />
                            )}
                          </div>

                          {/* step card */}
                          <button
                            onClick={() => toggleStep(s.id)}
                            style={{
                              flex: 1,
                              textAlign: "left",
                              fontFamily: BODY,
                              background: on ? "color-mix(in srgb, var(--accent) 9%, #fff)" : "#fff",
                              border: `1.5px solid ${on ? ACCENT : "#dde2f3"}`,
                              borderRadius: 13,
                              padding: "12px 15px",
                              marginBottom: 12,
                              cursor: "pointer",
                              transition: "border-color .14s, background .14s",
                            }}
                          >
                            {on && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 7,
                                  fontFamily: MONO,
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  letterSpacing: ".04em",
                                  textTransform: "uppercase",
                                  color: ACCENT,
                                  marginBottom: 7,
                                  paddingBottom: 7,
                                  borderBottom: "1px dashed color-mix(in srgb, var(--accent) 40%, #dde2f3)",
                                }}
                              >
                                🧑 human reviews before this runs
                              </div>
                            )}
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: "#1c2030", lineHeight: 1.3 }}>
                                  {s.title}
                                </div>
                                <div style={{ fontSize: 14, color: "#414a68", marginTop: 3, lineHeight: 1.45 }}>
                                  {s.detail}
                                </div>
                                <div style={{ fontSize: 13, color: "#7c84a4", marginTop: 6, lineHeight: 1.4 }}>
                                  <span style={{ fontWeight: 700 }}>Impact:</span> {s.impact}
                                </div>
                              </div>
                              <span
                                style={{
                                  flex: "none",
                                  fontFamily: MONO,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: ".04em",
                                  color: on ? ACCENT : "#9aa3c4",
                                  whiteSpace: "nowrap",
                                  marginTop: 2,
                                }}
                              >
                                {on ? "CHECKPOINT ✓" : "+ CHECKPOINT"}
                              </span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4, flexWrap: "wrap" }}>
                    <button
                      onClick={submit}
                      disabled={submitting}
                      style={{
                        ...primaryBtn,
                        opacity: submitting ? 0.5 : 1,
                        cursor: submitting ? "default" : "pointer",
                      }}
                    >
                      {submitting ? "RUNNING…" : "RUN THE WORKFLOW →"}
                    </button>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#7c84a4" }}>
                      safe but still fast — calibrate
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* BRIEF MODAL — fixed so a tall hand-off escapes the card's clip. */}
            {phase === "modal" && scenario && (
              <div style={overlay("fixed")}>
                <div style={modalCard(440)}>
                  <div style={modalKicker}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />{" "}
                    new workflow · {RISK_LABEL[scenario.riskTier].toLowerCase()}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        flex: "none",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg,#4c63d2,#7e8fe6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: DISPLAY,
                        fontWeight: 700,
                        fontSize: 16,
                        color: "#fff",
                      }}
                    >
                      {scenario.brief.senderInitials}
                    </div>
                    <div>
                      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>
                        {scenario.brief.senderName}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#7c84a4" }}>
                        {scenario.brief.senderRole}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      lineHeight: 1.55,
                      marginTop: 16,
                      border: "1px solid #d8def4",
                      borderRadius: 14,
                      padding: "14px 16px",
                      background: "#f6f7fd",
                      color: "#414a68",
                    }}
                  >
                    {scenario.brief.message}
                  </div>
                  <button
                    onClick={() => setPhase("place")}
                    style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}
                  >
                    OPEN THE WORKFLOW →
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
  color: "#5b6488",
  background: "#f2f4fc",
  border: "1px solid #d4daf2",
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
  color: "#5b6488",
  border: "1px solid #d4daf2",
  background: "#f2f4fc",
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
  color: "#7c84a4",
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

function riskBadge(tier: RiskTier): React.CSSProperties {
  const map: Record<RiskTier, { c: string; bg: string; b: string }> = {
    low: { c: GREEN, bg: "#eef7ec", b: "#cfe6d4" },
    medium: { c: AMBER, bg: "#fdf8ee", b: "#efe2c9" },
    high: { c: RED, bg: "#fdf1ee", b: "#efd2c9" },
  };
  const m = map[tier];
  return {
    flex: "none",
    fontFamily: MONO,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: m.c,
    background: m.bg,
    border: `1px solid ${m.b}`,
    borderRadius: 999,
    padding: "5px 11px",
    whiteSpace: "nowrap",
  };
}

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
    background: "rgba(24,28,60,.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
    zIndex: 50,
    overflowY: "auto",
    animation: "hg-overlayIn .25s ease",
  };
}

function modalCard(maxWidth: number): React.CSSProperties {
  return {
    maxWidth,
    width: "100%",
    background: "#fffdfb",
    border: "1px solid #d8def4",
    borderRadius: 20,
    boxShadow: "0 30px 60px -24px rgba(24,28,60,.6)",
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
  color: "#7c84a4",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

function Dots({ big, inline }: { big?: boolean; inline?: boolean }) {
  const s = big ? 8 : 5;
  const dot = (delay: string): React.CSSProperties => ({
    width: s,
    height: s,
    borderRadius: "50%",
    background: big ? "#c4cdf0" : ACCENT,
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
          In the Loop
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#414a68", marginTop: 10 }}>
          Up to now you&apos;ve worked with AI one task at a time. Here it&apos;s wired into a{" "}
          <b>workflow that runs on its own</b> — step after step, with no one watching. Your job is
          to decide where a <b>human must step in and review</b> before the AI&apos;s action takes
          effect. Tap a step to add a checkpoint, then run it and see what happened.
        </p>

        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            marginTop: 16,
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 42%, #d8def4)`,
            background: `color-mix(in srgb, ${ACCENT} 8%, #fffdfb)`,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>⚖️</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#414a68" }}>
            <b style={{ color: ACCENT }}>It cuts both ways.</b> Skip a checkpoint where an action
            can&apos;t be undone or affects a real person, and a bad call slips through — that&apos;s
            <b> liability</b>. But park a human in front of every step and you throw away the speed
            the redesign was for — that&apos;s <b>killing the efficiency</b>. Read each step&apos;s
            <b> impact</b> line and place checkpoints only where they truly earn their cost.
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #d8def4", borderRadius: 12, background: "#f6f7fd", overflow: "hidden" }}>
          <div
            onClick={() => setRulesOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "12px 14px" }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#7c84a4" }}>{rulesOpen ? "▾" : "▸"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#5b6488", textTransform: "uppercase" }}>
              Learning outcomes &amp; common rules
            </span>
          </div>
          {rulesOpen && (
            <div style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.5, color: "#414a68" }}>
              <p style={{ marginTop: 0, fontWeight: 600 }}>You&apos;ll practise:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>Spotting where AI can own a decision and where a human must stay accountable.</li>
                <li>Designing oversight that balances speed against appropriate human review.</li>
                <li>Calibrating checkpoints without killing the efficiency the redesign won.</li>
              </ul>
              <p style={{ marginTop: 0, fontWeight: 600 }}>How you score:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li><b>Coverage</b> is the gate — guard every step that&apos;s irreversible or affects a person, or you can&apos;t clear.</li>
                <li><b>Efficiency</b> earns the rest — leaving the safe, reversible steps to run; over-cautious checkpoints hurt most.</li>
                <li>Checkpointing <i>everything</i> fails just like missing a critical step.</li>
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
      <div style={{ fontSize: 13, color: "#5b6488", marginTop: 2 }}>{label}</div>
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

/** Per-step verdict: how the kind + the player's checkpoint call combine. */
function stepVerdict(kind: StepKind, checkpointed: boolean): {
  ok: boolean;
  tone: "good" | "bad" | "warn" | "neutral";
  tag: string;
  note: string;
} {
  switch (kind) {
    case "critical":
      return checkpointed
        ? { ok: true, tone: "good", tag: "needed a human", note: "guarded — you caught the step that couldn't be walked back" }
        : { ok: false, tone: "bad", tag: "needed a human", note: "left unguarded — a bad call could slip through here" };
    case "trap":
      return checkpointed
        ? { ok: false, tone: "bad", tag: "looked risky", note: "needless checkpoint — this step was reversible, so it only added delay" }
        : { ok: true, tone: "good", tag: "looked risky", note: "rightly left to run — it sounded high-stakes but was reversible" };
    case "safe":
      return checkpointed
        ? { ok: false, tone: "warn", tag: "safe to automate", note: "needless checkpoint — harmless, but it slows the workflow" }
        : { ok: true, tone: "good", tag: "safe to automate", note: "rightly left to run" };
    case "optional":
    default:
      return { ok: true, tone: "neutral", tag: "judgment call", note: checkpointed ? "a fair extra checkpoint" : "fine either way" };
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
  const guardedAll = result.criticalCheckpointed >= result.criticalTotal;
  const stayedLean = result.overChecked === 0;

  return (
    <div
      style={{
        border: "1px solid #d8def4",
        borderRadius: 22,
        background: "#fffdfb",
        boxShadow: "0 22px 50px -28px rgba(30,36,80,.4)",
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
        <Verdict ok={guardedAll} label={guardedAll ? "guarded every critical step" : "missed a critical step"} />
        <Verdict ok={stayedLean} label={stayedLean ? "no needless checkpoints" : "over-checkpointed"} />
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
        {statCard("#d8def4", "#f6f7fd", "#1c2030", `${result.coverage}%`, "coverage (the gate)")}
        {statCard("#d8def4", "#f6f7fd", "#1c2030", `${result.efficiency}%`, "efficiency (stay lean)")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: GREEN, fontWeight: 700 }}>+{result.xpEarned} XP</span>
        {result.bonusXp > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, color: AMBER, fontWeight: 700 }}>+{result.bonusXp} bonus ★</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#5b6488" }}>
          level {result.player.level} · {result.player.xp} XP
        </span>
      </div>

      {/* what happened when it ran */}
      <div style={{ ...kicker, marginTop: 24 }}>What happened when you ran it</div>
      <div
        style={{
          fontSize: 14.5,
          lineHeight: 1.55,
          marginTop: 10,
          border: "1px solid #d8def4",
          borderRadius: 14,
          padding: "14px 16px",
          background: "#f6f7fd",
          color: "#414a68",
          whiteSpace: "pre-wrap",
        }}
      >
        {result.output}
      </div>

      {/* per-step breakdown */}
      <div style={{ ...kicker, marginTop: 24 }}>The workflow, reviewed</div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 9 }}>
        {result.steps.map((s) => {
          const v = stepVerdict(s.kind, s.checkpointed);
          const toneColor =
            v.tone === "good" ? GREEN : v.tone === "bad" ? RED : v.tone === "warn" ? AMBER : "#5b6488";
          const toneBg =
            v.tone === "good" ? "#eef7ec" : v.tone === "bad" ? "#fdf1ee" : v.tone === "warn" ? "#fdf8ee" : "#f6f7fd";
          const toneBorder =
            v.tone === "good" ? "#cfe6d4" : v.tone === "bad" ? "#efd2c9" : v.tone === "warn" ? "#efe2c9" : "#d8def4";
          return (
            <div
              key={s.id}
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
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: "#1c2030" }}>{s.title}</span>
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
                      color: s.checkpointed ? ACCENT : "#9aa3c4",
                    }}
                  >
                    {s.checkpointed ? "you checkpointed" : "you left it to run"}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#5b6488", marginTop: 3 }}>{v.note}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* why */}
      <div style={{ marginTop: 16, borderLeft: `3px solid ${ACCENT}`, padding: "2px 0 2px 13px", color: "#414a68", fontSize: 15, lineHeight: 1.5 }}>
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
  const missedCritical = history.filter((h) => h.coverage < 100).length;
  const overChecked = history.filter((h) => h.efficiency < 100).length;
  const hints: string[] = [];
  if (missedCritical > 0) {
    hints.push(
      `You left a critical step unguarded on ${missedCritical} round${missedCritical === 1 ? "" : "s"} — coverage is the gate. If a step can't be undone or affects a real person, a human has to be in the loop before it runs.`,
    );
  }
  if (overChecked > 0) {
    hints.push(
      `Needless checkpoints crept in on ${overChecked} round${overChecked === 1 ? "" : "s"} — a human in front of a reversible draft or an internal step only adds delay. When a step is cheap to undo, let it run.`,
    );
  }
  hints.push(
    "The skill is calibration: guard the moments that truly can't be walked back, and trust the AI with the rest.",
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
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#7c84a4", textTransform: "uppercase" }}>
          game complete
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
          {avg >= 85 ? "Oversight Architect 🏆" : avg >= 65 ? "Safe hands 🛡️" : "Keep practising 🔁"}
        </h2>
        <p style={{ fontSize: 15.5, color: "#5b6488", marginTop: 6 }}>
          You cleared <b style={{ color: "#1c2030" }}>{cleared} of {total}</b> rounds, with{" "}
          <b style={{ color: "#1c2030" }}>{perfect}</b> perfect.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 20, textAlign: "left" }}>
          {statCard("#d8def4", "#f6f7fd", "#1c2030", `${avg}%`, "average score")}
          {statCard("#cfe6d4", "#eef7ec", GREEN, `${cleared}/${total}`, "rounds cleared (≥65%)")}
          {statCard("#efe2c9", "#fdf8ee", AMBER, `+${totalXp}`, "XP earned")}
        </div>

        {hints.length > 0 ? (
          <div style={{ marginTop: 22, border: "1.5px solid color-mix(in srgb, var(--accent) 32%, #d8def4)", background: "color-mix(in srgb, var(--accent) 6%, #fffdfb)", borderRadius: 16, padding: "16px 18px", textAlign: "left" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: ACCENT, textTransform: "uppercase", marginBottom: 10 }}>
              How to improve
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {hints.map((h, i) => (
                <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, color: "#414a68" }}>{h}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ fontSize: 14.5, color: GREEN, fontWeight: 600, marginTop: 18 }}>
            Well-judged oversight — you kept a human on every call that mattered and trusted the AI with the rest.
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
