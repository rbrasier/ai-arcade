"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type {
  Intervention,
  StepCharacteristics,
} from "@/lib/right-tool-for-the-job-scoring";
import type { ToolTier } from "@/lib/right-tool-tiers";
import { VideoPlaceholder } from "./VideoExplainer";
import { EXPLAINER_SCRIPTS } from "@/lib/game-explainer-scripts";

const ACCENT = "#0e7490";
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

/** Client-side display copy for the four fixed interventions (no ground truth). */
const INTERVENTION_META: Record<
  Intervention,
  { label: string; blurb: string; icon: string }
> = {
  manual: {
    label: "Leave it manual",
    blurb: "Keep doing it by hand. No build, no upkeep — you just keep paying the time.",
    icon: "✍️",
  },
  rules: {
    label: "Rules-based automation",
    blurb: "A deterministic script or filter. Cheap and reliable on clean, predictable inputs; brittle on messy ones.",
    icon: "⚙️",
  },
  llm: {
    label: "Use an LLM",
    blurb: "A model handles it. Flexible on messy language; ongoing per-use cost and some error rate.",
    icon: "🤖",
  },
  "custom-app": {
    label: "Commission a custom app",
    blurb: "IT builds a tailored application. Highest capability and lowest error — but a big up-front build.",
    icon: "🏗️",
  },
};
const INTERVENTION_ORDER: Intervention[] = ["manual", "rules", "llm", "custom-app"];

interface SafeScenario {
  topic: string;
  tier: ToolTier;
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  goal: string;
  stepTitle: string;
  stepDetail: string;
  characteristics: StepCharacteristics;
}

interface OptionResult {
  intervention: Intervention;
  amortisedBuild: number;
  annualMaintenance: number;
  failureCost: number;
  residualLabour: number;
  annualCost: number;
  savings: number;
  isBest: boolean;
}

interface ScoreResult {
  score: number;
  maxScore: number;
  scoreRatio: number;
  chosen: Intervention;
  bestIntervention: Intervention;
  verdict: "right" | "over-built" | "under-built";
  regret: number;
  options: OptionResult[];
  characteristics: StepCharacteristics;
  stepTitle: string;
  stepDetail: string;
  goal: string;
  tier: ToolTier;
  output: string;
  explanation: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "modal" | "choose";

interface HistoryEntry {
  score: number;
  xp: number;
  verdict: ScoreResult["verdict"];
  exceptional: boolean;
}

const TIER_LABEL: Record<ToolTier, string> = {
  1: "Warm-up",
  2: "Free text",
  3: "Resist the shiny option",
  4: "Don't under-build",
  5: "Boss round",
};

function gbp(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

const VARIABILITY_LABEL: Record<StepCharacteristics["variability"], string> = {
  identical: "Identical every time",
  some: "Some variation",
  high: "Every case differs",
};
const STRUCTURE_LABEL: Record<StepCharacteristics["structure"], string> = {
  structured: "Clean, structured fields",
  semi: "Semi-structured",
  free: "Free text",
};

export function RightToolForTheJobGame({ rounds }: { rounds: RoundRef[] }) {
  const router = useRouter();
  const total = rounds.length || 5;

  const [roundIndex, setRoundIndex] = useState(0);
  const [screen, setScreen] = useState<"play" | "results" | "summary">("play");
  const [phase, setPhase] = useState<Phase>("intro");
  const [scenario, setScenario] = useState<SafeScenario | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [chosen, setChosen] = useState<Intervention | null>(null);
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
        const res = await fetch("/api/games/right-tool-for-the-job/generate", {
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
    [rounds, prefetchRound],
  );

  const submit = useCallback(async () => {
    if (!roundId || !chosen) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/games/right-tool-for-the-job/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, chosen }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ScoreResult;
      setResult(data);
      setHistory((h) => [
        ...h,
        {
          score: data.score,
          xp: data.xpEarned + data.bonusXp,
          verdict: data.verdict,
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
  }, [roundId, chosen, router]);

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
    setChosen(null);
  }, []);

  // ===================== RENDER =====================
  const pageStyle: React.CSSProperties = {
    ["--accent" as string]: ACCENT,
    minHeight: "100vh",
    background: "radial-gradient(120% 80% at 80% -10%, #eaf5f8 0%, #e0eef3 55%)",
    fontFamily: BODY,
    color: "#16242b",
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
            borderBottom: "1px solid #cfe1e8",
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
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, #cfe1e8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7h11M4 12h7M4 17h13"
                    stroke="#16242b"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <circle cx="18.5" cy="7" r="2.4" stroke={ACCENT} strokeWidth="1.8" />
                  <circle cx="14.5" cy="12" r="2.4" stroke={ACCENT} strokeWidth="1.8" />
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
                Fit for Purpose
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
              border: "1px solid #cfe1e8",
              borderRadius: 22,
              background: "#fffdfb",
              boxShadow: "0 22px 50px -28px rgba(14,60,80,.4)",
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
                borderBottom: "1px solid #e2eef3",
                background: "#f1f8fa",
              }}
            >
              <div style={diamondAvatar(38)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17l6-6 4 4 8-8" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
                  {scenario ? scenario.stepTitle : "The step"}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#5d7681", letterSpacing: ".02em" }}>
                  pick the tool with the best net value
                </div>
              </div>
              {scenario && phase === "choose" && (
                <span style={tierBadge(scenario.tier)}>{TIER_LABEL[scenario.tier]}</span>
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
                    color: "#5d7681",
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
                      <div style={{ marginTop: 12 }}>Sizing up the step…</div>
                    </>
                  )}
                </div>
              )}

              {scenario && phase === "choose" && (
                <>
                  {/* the step + goal */}
                  <div
                    style={{
                      border: "1px solid #e2eef3",
                      borderRadius: 14,
                      background: "#f1f8fa",
                      padding: "14px 16px",
                    }}
                  >
                    <div style={kicker}>the step · from {scenario.brief.senderName}</div>
                    <div style={{ fontSize: 15, color: "#33474f", lineHeight: 1.45 }}>
                      {scenario.stepDetail}
                    </div>
                  </div>

                  {/* characteristics */}
                  <div>
                    <div style={kicker}>what you know about it</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                      <CharChip
                        label="Volume"
                        value={`${scenario.characteristics.volumePerYear.toLocaleString("en-GB")} / year`}
                      />
                      <CharChip
                        label="By hand"
                        value={`${scenario.characteristics.manualMinutesPerRun} min each`}
                      />
                      <CharChip
                        label="Cost of a slip"
                        value={gbp(scenario.characteristics.riskCostPerFailure)}
                      />
                      <CharChip
                        label="Variability"
                        value={VARIABILITY_LABEL[scenario.characteristics.variability]}
                      />
                      <CharChip
                        label="Input"
                        value={STRUCTURE_LABEL[scenario.characteristics.structure]}
                      />
                    </div>
                  </div>

                  {/* the four options */}
                  <div>
                    <div style={kicker}>pick one — weigh build &amp; upkeep against the time it saves</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {INTERVENTION_ORDER.map((k) => {
                        const meta = INTERVENTION_META[k];
                        const on = chosen === k;
                        return (
                          <button
                            key={k}
                            onClick={() => setChosen(k)}
                            style={{
                              display: "flex",
                              gap: 12,
                              alignItems: "flex-start",
                              textAlign: "left",
                              fontFamily: BODY,
                              background: on
                                ? "color-mix(in srgb, var(--accent) 9%, #fff)"
                                : "#fff",
                              border: `1.5px solid ${on ? ACCENT : "#d4e3e9"}`,
                              borderRadius: 13,
                              padding: "13px 15px",
                              cursor: "pointer",
                              transition: "border-color .14s, background .14s",
                            }}
                          >
                            <span style={{ fontSize: 22, lineHeight: 1.1, flex: "none" }}>
                              {meta.icon}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  fontSize: 15.5,
                                  fontWeight: 700,
                                  color: "#16242b",
                                }}
                              >
                                {meta.label}
                              </span>
                              <span style={{ display: "block", fontSize: 13.5, color: "#4a5e66", marginTop: 3, lineHeight: 1.45 }}>
                                {meta.blurb}
                              </span>
                            </span>
                            <span
                              style={{
                                flex: "none",
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                border: `2px solid ${on ? ACCENT : "#cddde3"}`,
                                background: on ? ACCENT : "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                fontSize: 12,
                                marginTop: 2,
                              }}
                            >
                              {on ? "✓" : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4, flexWrap: "wrap" }}>
                    <button
                      onClick={submit}
                      disabled={submitting || !chosen}
                      style={{
                        ...primaryBtn,
                        opacity: submitting || !chosen ? 0.5 : 1,
                        cursor: submitting || !chosen ? "default" : "pointer",
                      }}
                    >
                      {submitting ? "RUNNING…" : "LOCK IT IN →"}
                    </button>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#5d7681" }}>
                      net value, not sophistication
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
                    new decision · {TIER_LABEL[scenario.tier].toLowerCase()}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        flex: "none",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg,#0e7490,#3aa6bf)",
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
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#5d7681" }}>
                        {scenario.brief.senderRole}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      lineHeight: 1.55,
                      marginTop: 16,
                      border: "1px solid #cfe1e8",
                      borderRadius: 14,
                      padding: "14px 16px",
                      background: "#f1f8fa",
                      color: "#33474f",
                    }}
                  >
                    {scenario.brief.message}
                  </div>
                  <button
                    onClick={() => setPhase("choose")}
                    style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}
                  >
                    SIZE UP THE STEP →
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
  color: "#436270",
  background: "#eaf3f6",
  border: "1px solid #cfe1e8",
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
  color: "#436270",
  border: "1px solid #cfe1e8",
  background: "#eaf3f6",
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
  color: "#5d7681",
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

function CharChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #d4e3e9",
        borderRadius: 11,
        background: "#fff",
        padding: "8px 12px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: "#7c939c",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#16242b", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function tierBadge(tier: ToolTier): React.CSSProperties {
  const map: Record<ToolTier, { c: string; bg: string; b: string }> = {
    1: { c: GREEN, bg: "#eef7ec", b: "#cfe6d4" },
    2: { c: ACCENT, bg: "#e8f4f7", b: "#c4dee6" },
    3: { c: AMBER, bg: "#fdf8ee", b: "#efe2c9" },
    4: { c: AMBER, bg: "#fdf8ee", b: "#efe2c9" },
    5: { c: RED, bg: "#fdf1ee", b: "#efd2c9" },
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
    background: "rgba(12,40,52,.5)",
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
    border: "1px solid #cfe1e8",
    borderRadius: 20,
    boxShadow: "0 30px 60px -24px rgba(12,40,52,.6)",
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
  color: "#5d7681",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

function Dots({ big, inline }: { big?: boolean; inline?: boolean }) {
  const s = big ? 8 : 5;
  const dot = (delay: string): React.CSSProperties => ({
    width: s,
    height: s,
    borderRadius: "50%",
    background: big ? "#b3d3dc" : ACCENT,
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
      <div style={{ ...modalCard(960), padding: "26px 28px", display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap" }}>
        <VideoPlaceholder script={EXPLAINER_SCRIPTS["right-tool-for-the-job"]} accent={ACCENT} />
        <div style={{ flex: "1 1 380px", minWidth: 0 }}>
        <div style={modalKicker}>how to play</div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: "-0.015em", margin: "8px 0 0" }}>
          Fit for Purpose
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#33474f", marginTop: 10 }}>
          Now that you can see work as a system of steps, the question is what to{" "}
          <b>do</b> with each one. A colleague hands you a single step and four ways
          to handle it — <b>leave it manual</b>, a <b>rules-based</b> automation, an{" "}
          <b>LLM</b>, or a <b>commissioned custom app</b>. Read what you know about the
          step, then pick the one that wins on <b>net value</b>.
        </p>

        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            marginTop: 16,
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 42%, #cfe1e8)`,
            background: `color-mix(in srgb, ${ACCENT} 8%, #fffdfb)`,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>🛠️</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#33474f" }}>
            <b style={{ color: ACCENT }}>It cuts both ways.</b> Reach for a shiny custom
            build on a step that runs a dozen times a year and the build never pays back —
            that&apos;s <b>over-building</b>. Leave a step that runs thousands of times a day
            to a human and it quietly bleeds time all year — that&apos;s{" "}
            <b>under-building</b>. Weigh build, upkeep and the cost of mistakes against the
            cost of doing nothing. Sometimes the smartest move is to build nothing.
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #cfe1e8", borderRadius: 12, background: "#f1f8fa", overflow: "hidden" }}>
          <div
            onClick={() => setRulesOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "12px 14px" }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#5d7681" }}>{rulesOpen ? "▾" : "▸"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#436270", textTransform: "uppercase" }}>
              Learning outcomes &amp; common rules
            </span>
          </div>
          {rulesOpen && (
            <div style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.5, color: "#33474f" }}>
              <p style={{ marginTop: 0, fontWeight: 600 }}>You&apos;ll practise:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>Matching an intervention to a step&apos;s volume, variability, risk and structure.</li>
                <li>Weighing build, maintenance and failure costs against the cost of inaction.</li>
                <li>Resisting AI-solutionism — knowing when &ldquo;leave it manual&rdquo; is the right call.</li>
              </ul>
              <p style={{ marginTop: 0, fontWeight: 600 }}>How you score:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>Each tool has a real annual cost: <b>build</b> (spread over 3 years) + <b>upkeep</b> + <b>cost of mistakes</b> + <b>leftover human time</b>.</li>
                <li>You score on how close your pick lands to the <b>cheapest</b> option — net value, not sophistication.</li>
                <li>Over-building a tiny job and under-building a huge one both fail.</li>
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
      <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#436270", marginTop: 2 }}>{label}</div>
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

/** The per-option cost table — the "what it produced" reveal for this game. */
function CostTable({ result }: { result: ScoreResult }) {
  const ordered = INTERVENTION_ORDER.map(
    (k) => result.options.find((o) => o.intervention === k)!,
  ).filter(Boolean);

  return (
    <div style={{ border: "1px solid #cfe1e8", borderRadius: 14, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.9fr 0.8fr 0.9fr",
          background: "#f1f8fa",
          borderBottom: "1px solid #e2eef3",
        }}
      >
        <div style={gridHeadCell}>Option</div>
        <div style={{ ...gridHeadCell, textAlign: "right" }}>Build/yr</div>
        <div style={{ ...gridHeadCell, textAlign: "right" }}>Upkeep</div>
        <div style={{ ...gridHeadCell, textAlign: "right" }}>Mistakes</div>
        <div style={{ ...gridHeadCell, textAlign: "right" }}>Labour</div>
        <div style={{ ...gridHeadCell, textAlign: "right" }}>Total/yr</div>
      </div>
      {ordered.map((o, i) => {
        const isChosen = o.intervention === result.chosen;
        const meta = INTERVENTION_META[o.intervention];
        return (
          <div
            key={o.intervention}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 0.8fr 0.8fr 0.9fr 0.8fr 0.9fr",
              borderBottom: i === ordered.length - 1 ? "none" : "1px solid #eef4f6",
              background: o.isBest
                ? "color-mix(in srgb, #1f8a5b 8%, #fff)"
                : isChosen
                  ? "color-mix(in srgb, var(--accent) 6%, #fff)"
                  : "transparent",
            }}
          >
            <div style={{ padding: "10px 12px", fontSize: 13, color: "#16242b", display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 14 }}>{meta.icon}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {meta.label}
              </span>
              {o.isBest && <span style={tinyTag(GREEN, "#cfe6d4", "#eef7ec")}>BEST</span>}
              {isChosen && !o.isBest && <span style={tinyTag(ACCENT, "#c4dee6", "#e8f4f7")}>YOU</span>}
              {isChosen && o.isBest && <span style={tinyTag(GREEN, "#cfe6d4", "#eef7ec")}>YOU</span>}
            </div>
            {[o.amortisedBuild, o.annualMaintenance, o.failureCost, o.residualLabour].map((v, j) => (
              <div key={j} style={costCell(false)}>{gbp(v)}</div>
            ))}
            <div style={costCell(true, o.isBest ? GREEN : "#16242b")}>{gbp(o.annualCost)}</div>
          </div>
        );
      })}
    </div>
  );
}

function tinyTag(color: string, border: string, bg: string): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: ".04em",
    color,
    border: `1px solid ${border}`,
    background: bg,
    borderRadius: 999,
    padding: "1px 6px",
    flex: "none",
  };
}

function costCell(total: boolean, color = "#33474f"): React.CSSProperties {
  return {
    padding: "10px 12px",
    textAlign: "right",
    fontFamily: MONO,
    fontSize: 12.5,
    fontWeight: total ? 700 : 600,
    color,
    borderLeft: "1px solid #eef4f6",
  };
}

const gridHeadCell: React.CSSProperties = {
  padding: "9px 12px",
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: ".03em",
  textTransform: "uppercase",
  color: "#5d7681",
};

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
  const verdictLabel =
    result.verdict === "right"
      ? "right-sized the tool"
      : result.verdict === "over-built"
        ? "over-built it"
        : "under-built it";

  return (
    <div
      style={{
        border: "1px solid #cfe1e8",
        borderRadius: 22,
        background: "#fffdfb",
        boxShadow: "0 22px 50px -28px rgba(14,60,80,.4)",
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
        <Verdict ok={result.verdict === "right"} label={verdictLabel} />
        <Verdict ok={cleared} label={cleared ? "cleared" : "below clear"} />
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
        {statCard(
          "#cfe1e8",
          "#f1f8fa",
          "#16242b",
          INTERVENTION_META[result.bestIntervention].label.replace("Commission a ", "").replace("Use an ", "").replace("Leave it ", ""),
          "best-value tool",
        )}
        {statCard(
          result.regret === 0 ? "#cfe6d4" : "#efd2c9",
          result.regret === 0 ? "#eef7ec" : "#fdf1ee",
          result.regret === 0 ? GREEN : RED,
          result.regret === 0 ? "£0" : gbp(result.regret),
          result.regret === 0 ? "wasted vs best" : "wasted / yr vs best",
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: GREEN, fontWeight: 700 }}>+{result.xpEarned} XP</span>
        {result.bonusXp > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, color: AMBER, fontWeight: 700 }}>+{result.bonusXp} bonus ★</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#436270" }}>
          level {result.player.level} · {result.player.xp} XP
        </span>
      </div>

      {/* the cost reveal */}
      <div style={{ ...kicker, marginTop: 24 }}>The real cost of each option, a year out</div>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: "#5d7681", margin: "0 0 12px" }}>
        Build is spread over 3 years; &ldquo;mistakes&rdquo; is the error rate × {result.characteristics.volumePerYear.toLocaleString("en-GB")} runs × {gbp(result.characteristics.riskCostPerFailure)}; &ldquo;labour&rdquo; is the human time still needed. Lowest total wins.
      </p>
      <CostTable result={result} />

      {/* what happened when it ran */}
      <div style={{ ...kicker, marginTop: 24 }}>What your choice produced</div>
      <div
        style={{
          fontSize: 14.5,
          lineHeight: 1.55,
          marginTop: 10,
          border: "1px solid #cfe1e8",
          borderRadius: 14,
          padding: "14px 16px",
          background: "#f1f8fa",
          color: "#33474f",
          whiteSpace: "pre-wrap",
        }}
      >
        {result.output}
      </div>

      {/* why */}
      <div style={{ marginTop: 16, borderLeft: `3px solid ${ACCENT}`, padding: "2px 0 2px 13px", color: "#33474f", fontSize: 15, lineHeight: 1.5 }}>
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
  const over = history.filter((h) => h.verdict === "over-built").length;
  const under = history.filter((h) => h.verdict === "under-built").length;
  const hints: string[] = [];
  if (over > 0) {
    hints.push(
      `You over-built on ${over} round${over === 1 ? "" : "s"} — a big build only pays back at volume. Before commissioning anything, check the annual time it actually saves can repay the build and upkeep.`,
    );
  }
  if (under > 0) {
    hints.push(
      `You under-built on ${under} round${under === 1 ? "" : "s"} — leaving a high-volume step manual, or pointing brittle rules at messy text, quietly bleeds cost all year. Match the capability to the size and shape of the work.`,
    );
  }
  hints.push(
    "The skill is net value: weigh build, upkeep and the cost of mistakes against the cost of doing nothing — and pick the right-sized tool, not the fanciest.",
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
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#5d7681", textTransform: "uppercase" }}>
          game complete
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
          {avg >= 85 ? "Right-Sizer 🏆" : avg >= 65 ? "Sound judgment 🛠️" : "Keep practising 🔁"}
        </h2>
        <p style={{ fontSize: 15.5, color: "#436270", marginTop: 6 }}>
          You cleared <b style={{ color: "#16242b" }}>{cleared} of {total}</b> rounds, with{" "}
          <b style={{ color: "#16242b" }}>{perfect}</b> perfect.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 20, textAlign: "left" }}>
          {statCard("#cfe1e8", "#f1f8fa", "#16242b", `${avg}%`, "average score")}
          {statCard("#cfe6d4", "#eef7ec", GREEN, `${cleared}/${total}`, "rounds cleared (≥65%)")}
          {statCard("#efe2c9", "#fdf8ee", AMBER, `+${totalXp}`, "XP earned")}
        </div>

        {hints.length > 0 ? (
          <div style={{ marginTop: 22, border: "1.5px solid color-mix(in srgb, var(--accent) 32%, #cfe1e8)", background: "color-mix(in srgb, var(--accent) 6%, #fffdfb)", borderRadius: 16, padding: "16px 18px", textAlign: "left" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: ACCENT, textTransform: "uppercase", marginBottom: 10 }}>
              How to improve
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {hints.map((h, i) => (
                <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, color: "#33474f" }}>{h}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ fontSize: 14.5, color: GREEN, fontWeight: 600, marginTop: 18 }}>
            Well-judged — you matched the tool to the job every time, building where it paid back and holding off where it didn&apos;t.
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
