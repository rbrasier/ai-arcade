"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type {
  CleanThePipeImpact,
  QualityBand,
  RecordAction,
  SourceAction,
} from "@/lib/clean-the-pipe-scoring";

const ACCENT = "#1f9488";
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

interface RecordItem {
  id: string;
  label: string;
  content: string;
}
interface SourceItem {
  id: string;
  name: string;
  mismatch: string;
  migrationEffort: number;
}
interface SafeScenario {
  topic: string;
  difficulty: number;
  stepName: string;
  datasetName: string;
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  goal: string;
  records: RecordItem[];
  sources: SourceItem[];
}

interface ResultRecord extends RecordItem {
  consequential: boolean;
  correctAction: RecordAction;
  reason: string;
  action: RecordAction;
}
interface ResultSource extends SourceItem {
  consequential: boolean;
  correctAction: SourceAction;
  reason: string;
  action: SourceAction;
}

interface ScoreResult {
  score: number;
  maxScore: number;
  accuracy: number;
  effort: number;
  consequentialTotal: number;
  cleanCorrect: number;
  missedConsequential: number;
  overCleaned: number;
  records: ResultRecord[];
  sources: ResultSource[];
  stepName: string;
  datasetName: string;
  goal: string;
  output: { raw: string; cleaned: string };
  impact: CleanThePipeImpact;
  explanation: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "modal" | "triage";

interface HistoryEntry {
  score: number;
  xp: number;
  accuracy: number;
  effort: number;
  exceptional: boolean;
}

const RECORD_OPTIONS: { value: RecordAction; label: string; icon: string }[] = [
  { value: "keep", label: "Keep", icon: "✓" },
  { value: "fix", label: "Fix", icon: "✎" },
  { value: "drop", label: "Drop", icon: "✕" },
];

const QUALITY_META: Record<QualityBand, { label: string; color: string; bg: string; border: string }> = {
  sound: { label: "Sound", color: GREEN, bg: "#eef7ec", border: "#cfe6d4" },
  degraded: { label: "Degraded", color: AMBER, bg: "#fdf8ee", border: "#efe2c9" },
  poisoned: { label: "Poisoned", color: RED, bg: "#fdf1ee", border: "#efd2c9" },
};

export function CleanThePipeGame({ rounds }: { rounds: RoundRef[] }) {
  const router = useRouter();
  const total = rounds.length || 5;

  const [roundIndex, setRoundIndex] = useState(0);
  const [screen, setScreen] = useState<"play" | "results" | "summary">("play");
  const [phase, setPhase] = useState<Phase>("intro");
  const [scenario, setScenario] = useState<SafeScenario | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [recordActions, setRecordActions] = useState<Record<string, RecordAction>>({});
  const [sourceActions, setSourceActions] = useState<Record<string, SourceAction>>({});
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
        const res = await fetch("/api/games/clean-the-pipe/generate", {
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
      setRecordActions({});
      setSourceActions({});
      setLoadError(null);
      try {
        const data = await prefetchRound(index);
        const init: Record<string, RecordAction> = {};
        for (const r of data.scenario.records) init[r.id] = "keep";
        const sinit: Record<string, SourceAction> = {};
        for (const s of data.scenario.sources) sinit[s.id] = "leave";
        setRecordActions(init);
        setSourceActions(sinit);
        setScenario(data.scenario);
        setRoundId(data.roundId);
        setPhase("modal");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load round");
      }
    },
    [rounds, prefetchRound],
  );

  const setRecordAction = useCallback((id: string, action: RecordAction) => {
    setRecordActions((prev) => ({ ...prev, [id]: action }));
  }, []);
  const toggleSource = useCallback((id: string) => {
    setSourceActions((prev) => ({
      ...prev,
      [id]: prev[id] === "migrate" ? "leave" : "migrate",
    }));
  }, []);

  const submit = useCallback(async () => {
    if (!roundId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/games/clean-the-pipe/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, recordActions, sourceActions }),
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
          effort: data.effort,
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
  }, [roundId, recordActions, sourceActions, router]);

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
    setRecordActions({});
    setSourceActions({});
  }, []);

  const cleanedCount =
    Object.values(recordActions).filter((a) => a !== "keep").length +
    Object.values(sourceActions).filter((a) => a === "migrate").length;

  // ===================== RENDER =====================
  const pageStyle: React.CSSProperties = {
    ["--accent" as string]: ACCENT,
    minHeight: "100vh",
    background: "radial-gradient(120% 80% at 80% -10%, #e6f4f1 0%, #def0ec 55%)",
    fontFamily: BODY,
    color: "#162824",
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
            borderBottom: "1px solid #c9e3dd",
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
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, #cfe6e0)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7h9a4 4 0 0 1 0 8H8"
                    stroke="#162824"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M16 4l4 3-4 3" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
                Clean the Pipe
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
              border: "1px solid #cfe6e0",
              borderRadius: 22,
              background: "#fffdfb",
              boxShadow: "0 22px 50px -28px rgba(20,50,44,.4)",
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
                borderBottom: "1px solid #e3f1ed",
                background: "#f1f9f6",
              }}
            >
              <div style={diamondAvatar(38)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M4 7h9a4 4 0 0 1 0 8H8" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
                  {scenario ? scenario.stepName : "AI step"}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#6f8a83", letterSpacing: ".02em" }}>
                  triage the data before you run it
                </div>
              </div>
              {scenario && phase === "triage" && (
                <span style={countBadge}>
                  {cleanedCount} cleaned
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
                    color: "#6f8a83",
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
                      <div style={{ marginTop: 12 }}>Pulling the data…</div>
                    </>
                  )}
                </div>
              )}

              {scenario && phase === "triage" && (
                <>
                  {/* the goal */}
                  <div
                    style={{
                      border: "1px solid #e3f1ed",
                      borderRadius: 14,
                      background: "#f1f9f6",
                      padding: "14px 16px",
                    }}
                  >
                    <div style={kicker}>the step · from {scenario.brief.senderName}</div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: "#162824" }}>
                      🎯 {scenario.goal}
                    </div>
                  </div>

                  {/* records */}
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <div style={kicker}>the data going in · {scenario.datasetName}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#6f8a83", whiteSpace: "nowrap" }}>
                      keep · fix · drop
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {scenario.records.map((r) => {
                      const action = recordActions[r.id] ?? "keep";
                      const touched = action !== "keep";
                      return (
                        <div
                          key={r.id}
                          style={{
                            border: `1.5px solid ${touched ? ACCENT : "#dde7e4"}`,
                            borderRadius: 13,
                            padding: "12px 14px",
                            background: touched ? "color-mix(in srgb, var(--accent) 7%, #fff)" : "#fff",
                            transition: "border-color .14s, background .14s",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 180 }}>
                              <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "#6f8a83", marginBottom: 4 }}>
                                {r.label}
                              </div>
                              <div style={{ fontSize: 14.5, color: "#26413b", lineHeight: 1.45 }}>
                                {r.content}
                              </div>
                            </div>
                            <Segmented
                              value={action}
                              onChange={(v) => setRecordAction(r.id, v)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* sources that don't fit */}
                  {scenario.sources.length > 0 && (
                    <>
                      <div style={{ ...kicker, marginTop: 6 }}>
                        sources that don&apos;t fit the system · leave as-is, or migrate (for a cost)
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {scenario.sources.map((s) => {
                          const migrate = (sourceActions[s.id] ?? "leave") === "migrate";
                          return (
                            <div
                              key={s.id}
                              style={{
                                border: `1.5px solid ${migrate ? ACCENT : "#e0d7c2"}`,
                                borderRadius: 13,
                                padding: "12px 14px",
                                background: migrate
                                  ? "color-mix(in srgb, var(--accent) 7%, #fff)"
                                  : "#fdfaf2",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                                <div style={{ flex: 1, minWidth: 200 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                    <span style={{ fontSize: 14 }}>⚠️</span>
                                    <span style={{ fontSize: 15, fontWeight: 700, color: "#162824" }}>{s.name}</span>
                                  </div>
                                  <div style={{ fontSize: 13.5, color: "#5b7269", lineHeight: 1.45 }}>
                                    {s.mismatch}
                                  </div>
                                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: AMBER, fontWeight: 700, marginTop: 7 }}>
                                    migration cost ≈ {s.migrationEffort} hrs of effort
                                  </div>
                                </div>
                                <button
                                  onClick={() => toggleSource(s.id)}
                                  style={{
                                    flex: "none",
                                    fontFamily: MONO,
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    letterSpacing: ".03em",
                                    color: migrate ? "#fff" : ACCENT,
                                    background: migrate ? ACCENT : "#fff",
                                    border: `1.5px solid ${ACCENT}`,
                                    borderRadius: 10,
                                    padding: "9px 14px",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {migrate ? "✓ MIGRATING" : "MIGRATE →"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

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
                      {submitting ? "RUNNING…" : "RUN THE STEP →"}
                    </button>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#6f8a83" }}>
                      not all dirt is equal — clean only what matters
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* BRIEF MODAL */}
            {phase === "modal" && scenario && (
              <div style={overlay("fixed")}>
                <div style={modalCard(440)}>
                  <div style={modalKicker}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />{" "}
                    new dataset · {scenario.topic}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        flex: "none",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg,#1f9488,#5cc2b4)",
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
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#6f8a83" }}>
                        {scenario.brief.senderRole}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      lineHeight: 1.55,
                      marginTop: 16,
                      border: "1px solid #cfe6e0",
                      borderRadius: 14,
                      padding: "14px 16px",
                      background: "#f1f9f6",
                      color: "#26413b",
                    }}
                  >
                    {scenario.brief.message}
                  </div>
                  <button
                    onClick={() => setPhase("triage")}
                    style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}
                  >
                    OPEN THE DATA →
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

function Segmented({
  value,
  onChange,
}: {
  value: RecordAction;
  onChange: (v: RecordAction) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        flex: "none",
        border: "1px solid #dde7e4",
        borderRadius: 10,
        overflow: "hidden",
        background: "#f1f9f6",
      }}
    >
      {RECORD_OPTIONS.map((opt) => {
        const on = value === opt.value;
        const danger = opt.value === "drop";
        const active = on ? (danger ? RED : ACCENT) : undefined;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              fontFamily: MONO,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: ".02em",
              color: on ? "#fff" : "#5b7269",
              background: active ?? "transparent",
              border: "none",
              padding: "8px 12px",
              cursor: "pointer",
              transition: "background .12s, color .12s",
            }}
          >
            {opt.icon} {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".04em",
  color: "#4f6c64",
  background: "#eaf5f1",
  border: "1px solid #c9e3dd",
  padding: "7px 12px",
  borderRadius: 9,
  whiteSpace: "nowrap",
};

const countBadge: React.CSSProperties = {
  flex: "none",
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: ACCENT,
  background: "color-mix(in srgb, #1f9488 12%, #fff)",
  border: "1px solid color-mix(in srgb, #1f9488 30%, #cfe6e0)",
  borderRadius: 999,
  padding: "5px 11px",
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
  color: "#4f6c64",
  border: "1px solid #c9e3dd",
  background: "#eaf5f1",
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
  color: "#6f8a83",
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
    background: "rgba(16,40,36,.5)",
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
    border: "1px solid #cfe6e0",
    borderRadius: 20,
    boxShadow: "0 30px 60px -24px rgba(16,40,36,.6)",
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
  color: "#6f8a83",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

function Dots({ big, inline }: { big?: boolean; inline?: boolean }) {
  const s = big ? 8 : 5;
  const dot = (delay: string): React.CSSProperties => ({
    width: s,
    height: s,
    borderRadius: "50%",
    background: big ? "#a9d4cc" : ACCENT,
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
          Clean the Pipe
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#26413b", marginTop: 10 }}>
          You&apos;re about to run an AI step on a batch of data — but the data going in is{" "}
          <b>dirty</b>. Garbage in, garbage out. Your job is to <b>triage the inputs first</b>:{" "}
          <b>keep</b> what&apos;s fine, <b>fix</b> what&apos;s broken but recoverable, and{" "}
          <b>drop</b> what doesn&apos;t belong — then run the step and see what it produced.
        </p>

        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            marginTop: 16,
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 42%, #cfe6e0)`,
            background: `color-mix(in srgb, ${ACCENT} 8%, #fffdfb)`,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>🧪</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#26413b" }}>
            <b style={{ color: ACCENT }}>Not all dirt is equal.</b> A cosmetic duplicate barely
            matters; a wrong-category or stale record poisons the whole result. Catch the dirt that
            <b> changes the output</b>, and resist scrubbing the harmless stuff. Later rounds add
            whole <b>sources that don&apos;t fit the system</b> — leave them as-is, or pay to{" "}
            <b>migrate</b> them, only when it&apos;s worth the effort.
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #cfe6e0", borderRadius: 12, background: "#f1f9f6", overflow: "hidden" }}>
          <div
            onClick={() => setRulesOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "12px 14px" }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#6f8a83" }}>{rulesOpen ? "▾" : "▸"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#4f6c64", textTransform: "uppercase" }}>
              Learning outcomes &amp; common rules
            </span>
          </div>
          {rulesOpen && (
            <div style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.5, color: "#26413b" }}>
              <p style={{ marginTop: 0, fontWeight: 600 }}>You&apos;ll practise:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>Recognising garbage-in-garbage-out as a data problem, not an AI problem.</li>
                <li>Triaging which input flaws actually change the output.</li>
                <li>Calibrating cleaning effort to consequence rather than tidiness.</li>
              </ul>
              <p style={{ marginTop: 0, fontWeight: 600 }}>How you score:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li><b>Accuracy</b> is the gate — handle every record or source that would poison the output, or you can&apos;t clear.</li>
                <li><b>Effort</b> earns the rest — over-cleaning harmless dirt or migrating a source that wasn&apos;t worth it costs you.</li>
                <li>Scrubbing <i>everything</i> fails just like missing the dirt that mattered.</li>
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
      <div style={{ fontSize: 13, color: "#4f6c64", marginTop: 2 }}>{label}</div>
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

type Tone = "good" | "bad" | "warn";
const ACTION_LABEL: Record<RecordAction | SourceAction, string> = {
  keep: "kept",
  fix: "fixed",
  drop: "dropped",
  leave: "left as-is",
  migrate: "migrated",
};

function recordVerdict(r: ResultRecord): { ok: boolean; tone: Tone; tag: string } {
  if (r.consequential) {
    if (r.action === r.correctAction) return { ok: true, tone: "good", tag: "mattered — handled right" };
    if (r.action === "keep") return { ok: false, tone: "bad", tag: "missed — poisoned the output" };
    return { ok: false, tone: "warn", tag: "neutralised, but handled suboptimally" };
  }
  if (r.action === "keep") return { ok: true, tone: "good", tag: "harmless — rightly left alone" };
  return { ok: false, tone: "warn", tag: "over-cleaned — wasted effort" };
}

function sourceVerdict(s: ResultSource): { ok: boolean; tone: Tone; tag: string } {
  if (s.consequential) {
    return s.action === "migrate"
      ? { ok: true, tone: "good", tag: "ill-fitting — migration paid off" }
      : { ok: false, tone: "bad", tag: "left in — output broken" };
  }
  return s.action === "leave"
    ? { ok: true, tone: "good", tag: "tolerable — rightly left as-is" }
    : { ok: false, tone: "warn", tag: `needless migration — ${s.migrationEffort} hrs wasted` };
}

const TONE_COLOR: Record<Tone, { c: string; bg: string; b: string }> = {
  good: { c: GREEN, bg: "#eef7ec", b: "#cfe6d4" },
  bad: { c: RED, bg: "#fdf1ee", b: "#efd2c9" },
  warn: { c: AMBER, bg: "#fdf8ee", b: "#efe2c9" },
};

/** The signature raw-vs-cleaned read: the deliverable the step produced both ways. */
function OutputContrast({ result }: { result: ScoreResult }) {
  const raw = QUALITY_META[result.impact.rawQuality];
  const yours = QUALITY_META[result.impact.yourQuality];
  const cols: { title: string; band: typeof raw; text: string; accent: boolean }[] = [
    { title: "From the raw data", band: raw, text: result.output.raw, accent: false },
    { title: "From your triaged data", band: yours, text: result.output.cleaned, accent: true },
  ];
  return (
    <div style={{ marginTop: 24 }}>
      <div style={kicker}>What the step produced — raw vs cleaned</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
        {cols.map((c) => (
          <div
            key={c.title}
            style={{
              border: `1px solid ${c.accent ? "color-mix(in srgb, #1f9488 35%, #cfe6e0)" : "#dde7e4"}`,
              borderRadius: 14,
              overflow: "hidden",
              background: c.accent ? "color-mix(in srgb, #1f9488 4%, #fff)" : "#fff",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "9px 13px",
                borderBottom: "1px solid #eef3f1",
                background: "#f6faf8",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: c.accent ? ACCENT : "#6f8a83" }}>
                {c.title}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: ".03em",
                  textTransform: "uppercase",
                  color: c.band.color,
                  background: c.band.bg,
                  border: `1px solid ${c.band.border}`,
                  borderRadius: 999,
                  padding: "3px 9px",
                }}
              >
                {c.band.label}
              </span>
            </div>
            <div style={{ padding: "12px 13px", fontSize: 13.5, lineHeight: 1.5, color: "#26413b" }}>
              {c.text}
            </div>
          </div>
        ))}
      </div>

      {/* effort read */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 12,
          border: "1px solid #dde7e4",
          borderRadius: 12,
          padding: "11px 15px",
          background: "#f6faf8",
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#26413b" }}>
          <b>{result.impact.effortHours} hrs</b> effort spent
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#6f8a83" }}>
          calibrated target ≈ <b>{result.impact.idealEffortHours} hrs</b>
        </span>
        <span style={{ fontSize: 13, color: "#4f6c64", flex: 1, minWidth: 200 }}>
          {result.impact.verdict}
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "#9ab3ac", margin: "8px 0 0", fontStyle: "italic" }}>
        Illustrative — the deliverable and the effort read show what your triage did to the result. They never affect your score.
      </p>
    </div>
  );
}

function ItemRow({
  title,
  detail,
  tag,
  tone,
  ok,
  actionLabel,
  reason,
}: {
  title: string;
  detail: string;
  tag: string;
  tone: Tone;
  ok: boolean;
  actionLabel: string;
  reason: string;
}) {
  const t = TONE_COLOR[tone];
  return (
    <div
      style={{
        display: "flex",
        gap: 11,
        alignItems: "flex-start",
        border: `1px solid ${t.b}`,
        background: t.bg,
        borderRadius: 12,
        padding: "11px 14px",
      }}
    >
      <span style={{ flex: "none", fontSize: 15, color: t.c, marginTop: 1 }}>{ok ? "✓" : "✕"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: "#162824" }}>{title}</span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              color: t.c,
              border: `1px solid ${t.b}`,
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            {tag}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "#9ab3ac" }}>
            you {actionLabel}
          </span>
        </div>
        {detail && <div style={{ fontSize: 13, color: "#5b7269", marginTop: 3, lineHeight: 1.4 }}>{detail}</div>}
        <div style={{ fontSize: 13, color: "#4f6c64", marginTop: 4, lineHeight: 1.45 }}>{reason}</div>
      </div>
    </div>
  );
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
  const caughtAll = result.missedConsequential === 0;
  const stayedLean = result.overCleaned === 0;

  return (
    <div
      style={{
        border: "1px solid #cfe6e0",
        borderRadius: 22,
        background: "#fffdfb",
        boxShadow: "0 22px 50px -28px rgba(20,50,44,.4)",
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
        <Verdict ok={caughtAll} label={caughtAll ? "caught the dirt that mattered" : "let bad data slip through"} />
        <Verdict ok={stayedLean} label={stayedLean ? "no needless cleaning" : "over-cleaned"} />
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
        {statCard("#cfe6e0", "#f1f9f6", "#162824", `${result.accuracy}%`, "accuracy (the gate)")}
        {statCard("#cfe6e0", "#f1f9f6", "#162824", `${result.effort}%`, "effort (calibrate)")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: GREEN, fontWeight: 700 }}>+{result.xpEarned} XP</span>
        {result.bonusXp > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, color: AMBER, fontWeight: 700 }}>+{result.bonusXp} bonus ★</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#4f6c64" }}>
          level {result.player.level} · {result.player.xp} XP
        </span>
      </div>

      {/* what the step produced, raw vs cleaned */}
      <OutputContrast result={result} />

      {/* per-record breakdown */}
      <div style={{ ...kicker, marginTop: 24 }}>The data, reviewed</div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 9 }}>
        {result.records.map((r) => {
          const v = recordVerdict(r);
          return (
            <ItemRow
              key={r.id}
              title={r.label}
              detail={r.content}
              tag={v.tag}
              tone={v.tone}
              ok={v.ok}
              actionLabel={ACTION_LABEL[r.action]}
              reason={r.reason}
            />
          );
        })}
        {result.sources.map((s) => {
          const v = sourceVerdict(s);
          return (
            <ItemRow
              key={s.id}
              title={`⚠️ ${s.name}`}
              detail={s.mismatch}
              tag={v.tag}
              tone={v.tone}
              ok={v.ok}
              actionLabel={ACTION_LABEL[s.action]}
              reason={s.reason}
            />
          );
        })}
      </div>

      {/* why */}
      <div style={{ marginTop: 16, borderLeft: `3px solid ${ACCENT}`, padding: "2px 0 2px 13px", color: "#26413b", fontSize: 15, lineHeight: 1.5 }}>
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
  const missed = history.filter((h) => h.accuracy < 100).length;
  const overCleaned = history.filter((h) => h.effort < 100).length;
  const hints: string[] = [];
  if (missed > 0) {
    hints.push(
      `Bad data slipped through on ${missed} round${missed === 1 ? "" : "s"} — accuracy is the gate. If a record or source would change the output (wrong category, stale, the wrong data type), it has to be handled before you run.`,
    );
  }
  if (overCleaned > 0) {
    hints.push(
      `You over-cleaned on ${overCleaned} round${overCleaned === 1 ? "" : "s"} — scrubbing a cosmetic duplicate or migrating a source that wasn't worth it just burns effort. Calibrate cleaning to consequence.`,
    );
  }
  hints.push(
    "The skill is triage: fix or drop the dirt that poisons the result, migrate only the sources that pay off, and leave the harmless stuff alone.",
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
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#6f8a83", textTransform: "uppercase" }}>
          game complete
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
          {avg >= 85 ? "Data Wrangler 🏆" : avg >= 65 ? "Clean enough 🧽" : "Keep practising 🔁"}
        </h2>
        <p style={{ fontSize: 15.5, color: "#4f6c64", marginTop: 6 }}>
          You cleared <b style={{ color: "#162824" }}>{cleared} of {total}</b> rounds, with{" "}
          <b style={{ color: "#162824" }}>{perfect}</b> perfect.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 20, textAlign: "left" }}>
          {statCard("#cfe6e0", "#f1f9f6", "#162824", `${avg}%`, "average score")}
          {statCard("#cfe6d4", "#eef7ec", GREEN, `${cleared}/${total}`, "rounds cleared (≥65%)")}
          {statCard("#efe2c9", "#fdf8ee", AMBER, `+${totalXp}`, "XP earned")}
        </div>

        {hints.length > 0 ? (
          <div style={{ marginTop: 22, border: "1.5px solid color-mix(in srgb, var(--accent) 32%, #cfe6e0)", background: "color-mix(in srgb, var(--accent) 6%, #fffdfb)", borderRadius: 16, padding: "16px 18px", textAlign: "left" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: ACCENT, textTransform: "uppercase", marginBottom: 10 }}>
              How to improve
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {hints.map((h, i) => (
                <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, color: "#26413b" }}>{h}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ fontSize: 14.5, color: GREEN, fontWeight: 600, marginTop: 18 }}>
            Sharp triage — you caught the dirt that mattered, migrated only what paid off, and left the harmless stuff alone.
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
