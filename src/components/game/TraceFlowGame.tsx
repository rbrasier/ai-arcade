"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  SHAPE_TIER_INFO,
  type ShapeTier,
  type FlowShape,
} from "@/lib/trace-flow-tiers";

const ACCENT = "#2b7fb8";
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

interface TrayStep {
  id: string;
  title: string;
  detail: string;
  input: string;
  output: string;
}
interface SafeScenario {
  topic: string;
  shapeTier: ShapeTier;
  shape: FlowShape;
  workflowName: string;
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  goal: string;
  steps: TrayStep[];
}

interface ResultStep {
  id: string;
  title: string;
  detail: string;
  input: string;
  output: string;
  position: number;
  parallelGroup: string | null;
  placedIndex: number;
  correct: boolean;
}
interface ResultBroken {
  fromId: string;
  toId: string;
  reason: string;
  caught: boolean;
}
interface ScoreResult {
  score: number;
  maxScore: number;
  sequence: number;
  diagnosis: number;
  correctlyPlaced: number;
  total: number;
  brokenTotal: number;
  brokenCaught: number;
  falseFlags: number;
  steps: ResultStep[];
  brokenHandoffs: ResultBroken[];
  loopBack: { fromId: string; toId: string; reason: string; correct: boolean } | null;
  parallel: { ids: string[]; correct: boolean } | null;
  shape: FlowShape;
  shapeTier: ShapeTier;
  workflowName: string;
  goal: string;
  output: string;
  explanation: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "modal" | "build";

interface HistoryEntry {
  score: number;
  xp: number;
  sequence: number;
  diagnosis: number;
  exceptional: boolean;
}

const pairKey = (a: string, b: string) => `${a}>${b}`;

export function TraceFlowGame({ rounds }: { rounds: RoundRef[] }) {
  const router = useRouter();
  const total = rounds.length || 5;

  const [roundIndex, setRoundIndex] = useState(0);
  const [screen, setScreen] = useState<"play" | "results" | "summary">("play");
  const [phase, setPhase] = useState<Phase>("intro");
  const [scenario, setScenario] = useState<SafeScenario | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // build state
  const [order, setOrder] = useState<string[]>([]);
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [parallelIds, setParallelIds] = useState<Set<string>>(new Set());
  const [loopFrom, setLoopFrom] = useState<string | null>(null);
  const [loopTo, setLoopTo] = useState<string | null>(null);

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
        const res = await fetch("/api/games/trace-the-flow/generate", {
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

  const resetBuild = useCallback(() => {
    setOrder([]);
    setFlags(new Set());
    setParallelIds(new Set());
    setLoopFrom(null);
    setLoopTo(null);
  }, []);

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
      resetBuild();
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
    [rounds, prefetchRound, resetBuild],
  );

  // ---- ordering controls ----
  const place = useCallback((id: string) => {
    setOrder((o) => (o.includes(id) ? o : [...o, id]));
  }, []);
  const unplace = useCallback((id: string) => {
    setOrder((o) => o.filter((x) => x !== id));
    setParallelIds((p) => {
      if (!p.has(id)) return p;
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    setLoopFrom((f) => (f === id ? null : f));
    setLoopTo((t) => (t === id ? null : t));
  }, []);
  const move = useCallback((index: number, dir: -1 | 1) => {
    setOrder((o) => {
      const j = index + dir;
      if (j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[index], n[j]] = [n[j], n[index]];
      return n;
    });
  }, []);
  const toggleFlag = useCallback((fromId: string, toId: string) => {
    const key = pairKey(fromId, toId);
    setFlags((f) => {
      const n = new Set(f);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);
  const toggleParallel = useCallback((id: string) => {
    setParallelIds((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!roundId || !scenario) return;
    setSubmitting(true);
    try {
      const brokenPairs = order
        .slice(0, -1)
        .map((id, i) => ({ fromId: id, toId: order[i + 1] }))
        .filter((p) => flags.has(pairKey(p.fromId, p.toId)));
      const loopBack =
        scenario.shape === "loopback" && loopFrom && loopTo
          ? { fromId: loopFrom, toId: loopTo }
          : null;
      const res = await fetch("/api/games/trace-the-flow/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId,
          orderedIds: order,
          brokenPairs,
          parallelIds:
            scenario.shape === "parallel" ? [...parallelIds] : [],
          loopBack,
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
          sequence: data.sequence,
          diagnosis: data.diagnosis,
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
  }, [roundId, scenario, order, flags, parallelIds, loopFrom, loopTo, router]);

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
    resetBuild();
  }, [resetBuild]);

  const stepById = useMemo(() => {
    const m = new Map<string, TrayStep>();
    scenario?.steps.forEach((s) => m.set(s.id, s));
    return m;
  }, [scenario]);
  const unplaced = useMemo(
    () => (scenario ? scenario.steps.filter((s) => !order.includes(s.id)) : []),
    [scenario, order],
  );
  const allPlaced = scenario ? order.length === scenario.steps.length : false;

  // ===================== RENDER =====================
  const pageStyle: React.CSSProperties = {
    ["--accent" as string]: ACCENT,
    minHeight: "100vh",
    background: "radial-gradient(120% 80% at 80% -10%, #e9f2f8 0%, #e2eef6 55%)",
    fontFamily: BODY,
    color: "#152230",
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
            borderBottom: "1px solid #cfe0ec",
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
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, #cfe0ec)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="5" cy="6" r="2.4" stroke="#152230" strokeWidth="1.7" />
                  <circle cx="5" cy="18" r="2.4" stroke="#152230" strokeWidth="1.7" />
                  <circle cx="19" cy="12" r="2.4" stroke={ACCENT} strokeWidth="1.7" />
                  <path d="M7.4 6.6 16.6 11M7.4 17.4 16.6 13" stroke="#152230" strokeWidth="1.7" strokeLinecap="round" />
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
                Trace the Flow
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
              border: "1px solid #cfe0ec",
              borderRadius: 22,
              background: "#fffefb",
              boxShadow: "0 22px 50px -28px rgba(20,40,70,.4)",
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
                borderBottom: "1px solid #e3edf5",
                background: "#f3f8fc",
              }}
            >
              <div style={diamondAvatar(38)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M4 7h10M4 12h16M4 17h7" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
                  {scenario ? scenario.workflowName : "Workflow"}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#6c7b8c", letterSpacing: ".02em" }}>
                  rebuild the chain · read each step&apos;s needs &amp; produces
                </div>
              </div>
              {scenario && phase === "build" && (
                <span style={shapeBadge(scenario.shapeTier)}>
                  {SHAPE_TIER_INFO[scenario.shapeTier].label}
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
                    color: "#6c7b8c",
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
                      <div style={{ marginTop: 12 }}>Untangling the workflow…</div>
                    </>
                  )}
                </div>
              )}

              {scenario && phase === "build" && (
                <>
                  {/* the goal */}
                  <div
                    style={{
                      border: "1px solid #e3edf5",
                      borderRadius: 14,
                      background: "#f3f8fc",
                      padding: "14px 16px",
                    }}
                  >
                    <div style={kicker}>the goal · from {scenario.brief.senderName}</div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: "#152230" }}>
                      🎯 {scenario.goal}
                    </div>
                  </div>

                  {/* shape note — what to look for this round */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      border: `1.5px solid color-mix(in srgb, ${ACCENT} 38%, #cfe0ec)`,
                      background: `color-mix(in srgb, ${ACCENT} 7%, #fffefb)`,
                      borderRadius: 13,
                      padding: "11px 14px",
                    }}
                  >
                    <span style={{ fontSize: 17, lineHeight: 1.1 }}>🧭</span>
                    <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "#39516a" }}>
                      {SHAPE_TIER_INFO[scenario.shapeTier].note}
                    </div>
                  </div>

                  {/* tray of unplaced steps */}
                  <div>
                    <div style={kicker}>steps to place · tap to add to your sequence</div>
                    {unplaced.length === 0 ? (
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 12,
                          color: GREEN,
                          padding: "8px 2px",
                        }}
                      >
                        ✓ all steps placed — fix the order below if you need to
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                        {unplaced.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => place(s.id)}
                            style={trayCard}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 700, color: "#152230" }}>
                                {s.title}
                              </div>
                              <div style={{ fontSize: 13, color: "#46586b", marginTop: 2, lineHeight: 1.4 }}>
                                {s.detail}
                              </div>
                              <IoLine input={s.input} output={s.output} />
                            </div>
                            <span style={placeChip}>+ PLACE</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* the sequence the player is building */}
                  {order.length > 0 && (
                    <div>
                      <div style={kicker}>your sequence · order the steps and flag any broken hand-off</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {order.map((id, i) => {
                          const s = stepById.get(id);
                          if (!s) return null;
                          const last = i === order.length - 1;
                          const nextId = order[i + 1];
                          const broken = nextId
                            ? flags.has(pairKey(id, nextId))
                            : false;
                          const isParallel = parallelIds.has(id);
                          return (
                            <div key={id}>
                              {/* step card with rail */}
                              <div style={{ display: "flex", gap: 12 }}>
                                <div style={railCol}>
                                  <div style={railNode(false)}>{i + 1}</div>
                                </div>
                                <div
                                  style={{
                                    flex: 1,
                                    border: `1.5px solid ${isParallel ? ACCENT : "#dbe6ef"}`,
                                    background: isParallel
                                      ? "color-mix(in srgb, var(--accent) 7%, #fff)"
                                      : "#fff",
                                    borderRadius: 13,
                                    padding: "11px 14px",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 14.5, fontWeight: 700, color: "#152230" }}>
                                        {s.title}
                                      </div>
                                      <IoLine input={s.input} output={s.output} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "none" }}>
                                      <button
                                        onClick={() => move(i, -1)}
                                        disabled={i === 0}
                                        style={iconBtn(i === 0)}
                                        aria-label="Move up"
                                      >
                                        ▲
                                      </button>
                                      <button
                                        onClick={() => move(i, 1)}
                                        disabled={last}
                                        style={iconBtn(last)}
                                        aria-label="Move down"
                                      >
                                        ▼
                                      </button>
                                      <button
                                        onClick={() => unplace(id)}
                                        style={iconBtn(false)}
                                        aria-label="Remove"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                  {scenario.shape === "parallel" && (
                                    <button
                                      onClick={() => toggleParallel(id)}
                                      style={parallelToggle(isParallel)}
                                    >
                                      {isParallel ? "∥ runs in parallel ✓" : "∥ mark as parallel"}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* connector / hand-off flag */}
                              {!last && nextId && (
                                <div style={{ display: "flex", gap: 12 }}>
                                  <div style={railCol}>
                                    <div
                                      style={{
                                        width: 2,
                                        height: 34,
                                        background: broken ? RED : "#cfe0ec",
                                        margin: "0 auto",
                                      }}
                                    />
                                  </div>
                                  <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "4px 0" }}>
                                    <button
                                      onClick={() => toggleFlag(id, nextId)}
                                      style={handoffChip(broken)}
                                    >
                                      {broken ? "⚠ broken hand-off — flagged" : "hand-off ok · flag if broken"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* loop-back picker (round 5) */}
                  {scenario.shape === "loopback" && order.length > 1 && (
                    <div
                      style={{
                        border: "1px solid #e3edf5",
                        borderRadius: 13,
                        background: "#f3f8fc",
                        padding: "13px 15px",
                      }}
                    >
                      <div style={kicker}>the rework loop · which step sends work back, and to where?</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                        <LoopSelect
                          value={loopFrom}
                          placeholder="step that sends work back…"
                          options={order.map((id, i) => ({
                            id,
                            label: `${i + 1}. ${stepById.get(id)?.title ?? id}`,
                          }))}
                          onChange={setLoopFrom}
                        />
                        <span style={{ fontFamily: MONO, fontSize: 13, color: "#6c7b8c" }}>↩ returns to</span>
                        <LoopSelect
                          value={loopTo}
                          placeholder="earlier step it returns to…"
                          options={order.map((id, i) => ({
                            id,
                            label: `${i + 1}. ${stepById.get(id)?.title ?? id}`,
                          }))}
                          onChange={setLoopTo}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4, flexWrap: "wrap" }}>
                    <button
                      onClick={submit}
                      disabled={submitting || !allPlaced}
                      style={{
                        ...primaryBtn,
                        opacity: submitting || !allPlaced ? 0.45 : 1,
                        cursor: submitting || !allPlaced ? "default" : "pointer",
                      }}
                    >
                      {submitting ? "TRACING…" : "RUN THE FLOW →"}
                    </button>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#6c7b8c" }}>
                      {allPlaced ? "order it, flag the breaks" : `place all ${scenario.steps.length} steps to run`}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* BRIEF MODAL — the messy account of how the work gets done. */}
            {phase === "modal" && scenario && (
              <div style={overlay("fixed")}>
                <div style={modalCard(460)}>
                  <div style={modalKicker}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />{" "}
                    how the work gets done · {SHAPE_TIER_INFO[scenario.shapeTier].label.toLowerCase()}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        flex: "none",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg,#2b7fb8,#5fb0d6)",
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
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#6c7b8c" }}>
                        {scenario.brief.senderRole}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      lineHeight: 1.55,
                      marginTop: 16,
                      border: "1px solid #cfe0ec",
                      borderRadius: 14,
                      padding: "14px 16px",
                      background: "#f3f8fc",
                      color: "#39516a",
                    }}
                  >
                    {scenario.brief.message}
                  </div>
                  <button
                    onClick={() => setPhase("build")}
                    style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}
                  >
                    TRACE THE FLOW →
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

// ===================== small bits =====================

function IoLine({ input, output }: { input: string; output: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 7 }}>
      <div style={{ fontSize: 12, color: "#6c7b8c", lineHeight: 1.35 }}>
        <span style={ioTag("#e3edf5", "#46586b")}>needs</span> {input}
      </div>
      <div style={{ fontSize: 12, color: "#6c7b8c", lineHeight: 1.35 }}>
        <span style={ioTag("color-mix(in srgb, var(--accent) 16%, #fff)", ACCENT)}>produces</span> {output}
      </div>
    </div>
  );
}

function ioTag(bg: string, color: string): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color,
    background: bg,
    borderRadius: 5,
    padding: "1px 6px",
    marginRight: 5,
  };
}

function LoopSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string | null;
  placeholder: string;
  options: { id: string; label: string }[];
  onChange: (id: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        fontFamily: BODY,
        fontSize: 13.5,
        color: value ? "#152230" : "#6c7b8c",
        background: "#fff",
        border: `1.5px solid ${value ? ACCENT : "#cfe0ec"}`,
        borderRadius: 10,
        padding: "8px 10px",
        maxWidth: 220,
        cursor: "pointer",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ===================== styles =====================

const chipStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".04em",
  color: "#4a5b6e",
  background: "#eef5fa",
  border: "1px solid #cfe0ec",
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
  color: "#4a5b6e",
  border: "1px solid #cfe0ec",
  background: "#eef5fa",
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
  color: "#6c7b8c",
  marginBottom: 8,
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

const trayCard: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  textAlign: "left",
  fontFamily: BODY,
  background: "#fff",
  border: "1.5px solid #dbe6ef",
  borderRadius: 13,
  padding: "11px 14px",
  cursor: "pointer",
};

const placeChip: React.CSSProperties = {
  flex: "none",
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: ".04em",
  color: ACCENT,
  whiteSpace: "nowrap",
  marginTop: 2,
};

const railCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  flex: "none",
  width: 26,
};

function railNode(muted: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: muted ? "#eef5fa" : ACCENT,
    border: `2px solid ${muted ? "#cfe0ec" : ACCENT}`,
    color: muted ? "#6c7b8c" : "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 700,
  };
}

function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 24,
    height: 22,
    fontSize: 11,
    fontFamily: MONO,
    color: disabled ? "#bcccd8" : "#4a5b6e",
    background: "#f3f8fc",
    border: "1px solid #dbe6ef",
    borderRadius: 7,
    cursor: disabled ? "default" : "pointer",
    lineHeight: 1,
    padding: 0,
  };
}

function handoffChip(broken: boolean): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: ".03em",
    color: broken ? RED : "#8595a4",
    background: broken ? "#fdf1ee" : "#f3f8fc",
    border: `1px dashed ${broken ? "#e6b8a8" : "#cfe0ec"}`,
    borderRadius: 8,
    padding: "5px 11px",
    cursor: "pointer",
  };
}

function parallelToggle(on: boolean): React.CSSProperties {
  return {
    marginTop: 9,
    fontFamily: MONO,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: ".03em",
    color: on ? "#fff" : ACCENT,
    background: on ? ACCENT : "color-mix(in srgb, var(--accent) 9%, #fff)",
    border: `1px solid ${ACCENT}`,
    borderRadius: 8,
    padding: "5px 11px",
    cursor: "pointer",
  };
}

function shapeBadge(tier: ShapeTier): React.CSSProperties {
  return {
    flex: "none",
    fontFamily: MONO,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: ACCENT,
    background: "color-mix(in srgb, var(--accent) 12%, #fff)",
    border: `1px solid color-mix(in srgb, ${ACCENT} 30%, #cfe0ec)`,
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
    background: "rgba(16,32,52,.5)",
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
    background: "#fffefb",
    border: "1px solid #cfe0ec",
    borderRadius: 20,
    boxShadow: "0 30px 60px -24px rgba(16,32,52,.6)",
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
  color: "#6c7b8c",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

function Dots({ big, inline }: { big?: boolean; inline?: boolean }) {
  const s = big ? 8 : 5;
  const dot = (delay: string): React.CSSProperties => ({
    width: s,
    height: s,
    borderRadius: "50%",
    background: big ? "#aecbe0" : ACCENT,
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
          Trace the Flow
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#39516a", marginTop: 10 }}>
          Before you can redesign work, you have to <b>see it</b>. A colleague describes how a task
          really gets done — in a messy, half-remembered way. Your job is to rebuild it into a clean{" "}
          <b>chain of steps</b>: tap each step to place it, then put them in the order the work
          actually flows. Read each step&apos;s <b>needs</b> and <b>produces</b> to work out what
          comes next.
        </p>

        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            marginTop: 16,
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 42%, #cfe0ec)`,
            background: `color-mix(in srgb, ${ACCENT} 8%, #fffefb)`,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>🔗</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#39516a" }}>
            <b style={{ color: ACCENT }}>Mind the hand-offs.</b> Where one step passes work to the
            next, the data can quietly break — <b>lost</b> or <b>reformatted</b> so the next step
            can&apos;t use it. Flag those broken links. And real work isn&apos;t always a straight
            line: later rounds hide a <b>parallel branch</b> and a <b>loop-back</b> for you to spot.
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #cfe0ec", borderRadius: 12, background: "#f3f8fc", overflow: "hidden" }}>
          <div
            onClick={() => setRulesOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "12px 14px" }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#6c7b8c" }}>{rulesOpen ? "▾" : "▸"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#4a5b6e", textTransform: "uppercase" }}>
              Learning outcomes &amp; common rules
            </span>
          </div>
          {rulesOpen && (
            <div style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.5, color: "#39516a" }}>
              <p style={{ marginTop: 0, fontWeight: 600 }}>You&apos;ll practise:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>Breaking opaque, &quot;I just do my job&quot; work into discrete input→output steps.</li>
                <li>Spotting broken hand-offs where a step&apos;s input doesn&apos;t match what came before.</li>
                <li>Recognising that workflows branch and loop — they&apos;re not always a straight line.</li>
              </ul>
              <p style={{ marginTop: 0, fontWeight: 600 }}>How you score:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li><b>Sequence</b> is the gate — reconstruct the chain in the right order, or you can&apos;t clear.</li>
                <li><b>Diagnosis</b> earns the rest — catch the broken hand-offs and the shape (branch / loop), without false flags.</li>
                <li>Over-flagging a sound hand-off costs you, just like missing a broken one.</li>
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
      <div style={{ fontSize: 13, color: "#4a5b6e", marginTop: 2 }}>{label}</div>
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
  const inOrder = result.sequence >= 100;
  const caughtAll =
    result.brokenTotal === 0 || result.brokenCaught >= result.brokenTotal;
  const noFalse = result.falseFlags === 0;
  const idToPos = new Map(result.steps.map((s) => [s.id, s.position + 1]));
  const brokenByTo = new Map(result.brokenHandoffs.map((b) => [b.toId, b]));

  return (
    <div
      style={{
        border: "1px solid #cfe0ec",
        borderRadius: 22,
        background: "#fffefb",
        boxShadow: "0 22px 50px -28px rgba(20,40,70,.4)",
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
        <Verdict ok={inOrder} label={inOrder ? "chain in the right order" : "chain out of order"} />
        {result.brokenTotal > 0 && (
          <Verdict ok={caughtAll} label={caughtAll ? "caught the broken hand-off" : "missed a broken hand-off"} />
        )}
        <Verdict ok={noFalse} label={noFalse ? "no false flags" : "raised a false flag"} />
        {result.parallel && (
          <Verdict ok={result.parallel.correct} label={result.parallel.correct ? "found the parallel branch" : "missed the parallel branch"} />
        )}
        {result.loopBack && (
          <Verdict ok={result.loopBack.correct} label={result.loopBack.correct ? "found the loop-back" : "missed the loop-back"} />
        )}
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
        {statCard("#cfe0ec", "#f3f8fc", "#152230", `${result.sequence}%`, "sequence (the gate)")}
        {statCard("#cfe0ec", "#f3f8fc", "#152230", `${result.diagnosis}%`, "diagnosis (hand-offs & shape)")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: GREEN, fontWeight: 700 }}>+{result.xpEarned} XP</span>
        {result.bonusXp > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, color: AMBER, fontWeight: 700 }}>+{result.bonusXp} bonus ★</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#4a5b6e" }}>
          level {result.player.level} · {result.player.xp} XP
        </span>
      </div>

      {/* what it produced */}
      <div style={{ ...kicker, marginTop: 24 }}>What the flow produced</div>
      <div
        style={{
          fontSize: 14.5,
          lineHeight: 1.55,
          marginTop: 10,
          border: "1px solid #cfe0ec",
          borderRadius: 14,
          padding: "14px 16px",
          background: "#f3f8fc",
          color: "#39516a",
          whiteSpace: "pre-wrap",
        }}
      >
        {result.output}
      </div>

      {/* the true chain revealed */}
      <div style={{ ...kicker, marginTop: 24 }}>The true flow</div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 0 }}>
        {result.steps.map((s, i) => {
          const last = i === result.steps.length - 1;
          const broken = brokenByTo.get(s.id); // a break on the hand-off INTO this step
          const placedRight = s.correct;
          return (
            <div key={s.id}>
              {/* incoming hand-off marker (between previous step and this one) */}
              {i > 0 && (
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={railCol}>
                    <div style={{ width: 2, height: broken ? "auto" : 22, minHeight: 22, background: broken ? RED : "#cfe0ec", margin: "0 auto" }} />
                  </div>
                  <div style={{ flex: 1, padding: broken ? "2px 0 8px" : 0 }}>
                    {broken && (
                      <div
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.45,
                          color: "#7a3a28",
                          background: "#fdf1ee",
                          border: "1px solid #efd2c9",
                          borderRadius: 10,
                          padding: "8px 11px",
                        }}
                      >
                        <b style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".03em", textTransform: "uppercase", color: RED }}>
                          {broken.caught ? "⚠ broken hand-off — you flagged it ✓" : "⚠ broken hand-off — you missed it"}
                        </b>
                        <div style={{ marginTop: 3 }}>{broken.reason}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 12 }}>
                <div style={railCol}>
                  <div style={railNode(false)}>{i + 1}</div>
                </div>
                <div
                  style={{
                    flex: 1,
                    border: `1px solid ${placedRight ? "#cfe6d4" : "#efd2c9"}`,
                    background: placedRight ? "#f4faf4" : "#fdf4f1",
                    borderRadius: 12,
                    padding: "11px 14px",
                    marginBottom: 2,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: "#152230" }}>{s.title}</span>
                    {s.parallelGroup && (
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: ".04em",
                          textTransform: "uppercase",
                          color: ACCENT,
                          border: `1px solid color-mix(in srgb, ${ACCENT} 35%, #cfe0ec)`,
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}
                      >
                        ∥ parallel
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: ".03em",
                        color: placedRight ? GREEN : RED,
                      }}
                    >
                      {placedRight
                        ? "✓ you placed it right"
                        : s.placedIndex >= 0
                          ? `✕ you put it ${ordinal(s.placedIndex + 1)}`
                          : "✕ unplaced"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#46586b", marginTop: 3, lineHeight: 1.4 }}>{s.detail}</div>
                  <IoLine input={s.input} output={s.output} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* loop-back note */}
      {result.loopBack && (
        <div
          style={{
            marginTop: 12,
            fontSize: 13.5,
            lineHeight: 1.45,
            color: "#39516a",
            background: "#f3f8fc",
            border: "1px solid #cfe0ec",
            borderRadius: 12,
            padding: "11px 14px",
          }}
        >
          <b style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".03em", textTransform: "uppercase", color: ACCENT }}>
            ↩ rework loop {result.loopBack.correct ? "— you found it ✓" : "— you missed it"}
          </b>
          <div style={{ marginTop: 3 }}>
            Step {idToPos.get(result.loopBack.fromId) ?? "?"} loops back to step{" "}
            {idToPos.get(result.loopBack.toId) ?? "?"}. {result.loopBack.reason}
          </div>
        </div>
      )}

      {/* why */}
      <div style={{ marginTop: 16, borderLeft: `3px solid ${ACCENT}`, padding: "2px 0 2px 13px", color: "#39516a", fontSize: 15, lineHeight: 1.5 }}>
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function buildImprovementHints(history: HistoryEntry[]): string[] {
  if (history.length === 0) return [];
  const misordered = history.filter((h) => h.sequence < 100).length;
  const weakDiagnosis = history.filter((h) => h.diagnosis < 100).length;
  const hints: string[] = [];
  if (misordered > 0) {
    hints.push(
      `You mis-sequenced ${misordered} round${misordered === 1 ? "" : "s"} — order is the gate. Chain the steps by matching each one's "needs" to the "produces" of the step before it; the right order falls out of the data.`,
    );
  }
  if (weakDiagnosis > 0) {
    hints.push(
      `Hand-offs and shape tripped you on ${weakDiagnosis} round${weakDiagnosis === 1 ? "" : "s"} — a broken link is where a step's input doesn't match what the previous step produced. Flag exactly those, and resist flagging sound ones.`,
    );
  }
  hints.push(
    "Seeing work as a chain of input→output steps is the literacy the rest of the arcade builds on — you can't redesign what you can't see.",
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
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#6c7b8c", textTransform: "uppercase" }}>
          game complete
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
          {avg >= 85 ? "Systems Thinker 🧭" : avg >= 65 ? "Flow Tracer 🔗" : "Keep practising 🔁"}
        </h2>
        <p style={{ fontSize: 15.5, color: "#4a5b6e", marginTop: 6 }}>
          You cleared <b style={{ color: "#152230" }}>{cleared} of {total}</b> rounds, with{" "}
          <b style={{ color: "#152230" }}>{perfect}</b> perfect.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 20, textAlign: "left" }}>
          {statCard("#cfe0ec", "#f3f8fc", "#152230", `${avg}%`, "average score")}
          {statCard("#cfe6d4", "#eef7ec", GREEN, `${cleared}/${total}`, "rounds cleared (≥65%)")}
          {statCard("#efe2c9", "#fdf8ee", AMBER, `+${totalXp}`, "XP earned")}
        </div>

        {hints.length > 0 ? (
          <div style={{ marginTop: 22, border: "1.5px solid color-mix(in srgb, var(--accent) 32%, #cfe0ec)", background: "color-mix(in srgb, var(--accent) 6%, #fffefb)", borderRadius: 16, padding: "16px 18px", textAlign: "left" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: ACCENT, textTransform: "uppercase", marginBottom: 10 }}>
              How to improve
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {hints.map((h, i) => (
                <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, color: "#39516a" }}>{h}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ fontSize: 14.5, color: GREEN, fontWeight: 600, marginTop: 18 }}>
            Sharp tracing — you saw the chain, caught the broken hand-offs, and read the branches and loops. That&apos;s the foundation the rest of the arcade builds on.
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
