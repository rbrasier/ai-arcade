"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type {
  SourceKind,
  SourcePath,
  SourceVerdict,
} from "@/lib/clean-the-pipe-scoring";
import type { SourcePreview, SourceType } from "@/lib/ai/clean-the-pipe";
import { VideoPlaceholder } from "./VideoExplainer";
import { EXPLAINER_SCRIPTS } from "@/lib/game-explainer-scripts";

const ACCENT = "#1f9488";
const DISPLAY = "var(--font-bricolage), sans-serif";
const BODY = "var(--font-hanken), system-ui, sans-serif";
const MONO = "var(--font-space-mono), monospace";
const GREEN = "#1f8a5b";
const RED = "#c0563a";
const AMBER = "#c9933f";
const BLUE = "#3b82c4";

export interface RoundRef {
  id: string;
  difficulty: number;
}

interface SourceView {
  id: string;
  type: SourceType;
  label: string;
  summary: string;
  preview: SourcePreview;
  usedFor: string;
  volume: number;
  ongoing: boolean;
  migrationEffortHours: number;
}
interface SafeScenario {
  topic: string;
  difficulty: number;
  stepName: string;
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  goal: string;
  sources: SourceView[];
}

interface SimColumn {
  ai: number;
  human: number;
  omission: number;
  total: number;
}

interface ResultSource extends Omit<SourceView, "preview"> {
  kind: SourceKind;
  reason: string;
  path: SourcePath;
  bestPath: SourcePath;
  verdict: SourceVerdict;
  yourErrors: number;
  bestErrors: number;
}

interface ScoreResult {
  score: number;
  maxScore: number;
  errorReduction: number;
  gateTripped: boolean;
  poisonedSources: number;
  bestPicks: number;
  overMigrated: number;
  sourcesTotal: number;
  simulation: { baseline: SimColumn; yours: SimColumn; best: SimColumn };
  sources: ResultSource[];
  stepName: string;
  goal: string;
  output: { before: string; after: string };
  explanation: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "modal" | "design";

interface HistoryEntry {
  score: number;
  xp: number;
  errorReduction: number;
  gateTripped: boolean;
  exceptional: boolean;
}

const PATH_OPTIONS: {
  value: SourcePath;
  label: string;
  icon: string;
  color: string;
  desc: string;
}[] = [
  { value: "keep", label: "Keep", icon: "=", color: "#4f6c64", desc: "feed it in as-is — it's already structured" },
  { value: "redirect", label: "Redirect", icon: "⤳", color: BLUE, desc: "cut the intake over so new data arrives structured" },
  { value: "migrate", label: "Migrate", icon: "⮕", color: ACCENT, desc: "convert / backfill the existing data (costs hours)" },
  { value: "exclude", label: "Exclude", icon: "✕", color: RED, desc: "leave it out of the step" },
];

const PATH_META: Record<SourcePath, { label: string; color: string }> = {
  keep: { label: "Keep", color: "#4f6c64" },
  redirect: { label: "Redirect", color: BLUE },
  migrate: { label: "Migrate", color: ACCENT },
  exclude: { label: "Exclude", color: RED },
};

const TYPE_META: Record<SourceType, { icon: string; label: string }> = {
  database: { icon: "🗄️", label: "Database" },
  spreadsheet: { icon: "📊", label: "Spreadsheet" },
  email: { icon: "✉️", label: "Inbox" },
  forms: { icon: "📝", label: "Forms" },
  scans: { icon: "📄", label: "Scans" },
  api: { icon: "🔌", label: "API feed" },
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
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);

  const [paths, setPaths] = useState<Record<string, SourcePath>>({});
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
      setPaths({});
      setOpenSourceId(null);
      setLoadError(null);
      try {
        const data = await prefetchRound(index);
        const init: Record<string, SourcePath> = {};
        for (const s of data.scenario.sources) init[s.id] = "keep";
        setPaths(init);
        setScenario(data.scenario);
        setRoundId(data.roundId);
        setPhase("modal");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load round");
      }
    },
    [rounds, prefetchRound],
  );

  const setPath = useCallback((id: string, path: SourcePath) => {
    setPaths((prev) => ({ ...prev, [id]: path }));
  }, []);

  const submit = useCallback(async () => {
    if (!roundId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/games/clean-the-pipe/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, paths }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ScoreResult;
      setResult(data);
      setHistory((h) => [
        ...h,
        {
          score: data.score,
          xp: data.xpEarned + data.bonusXp,
          errorReduction: data.errorReduction,
          gateTripped: data.gateTripped,
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
  }, [roundId, paths, router]);

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
    setPaths({});
    setOpenSourceId(null);
  }, []);

  // Live read (no ground truth — just what the player has set so far).
  const changedCount = scenario
    ? scenario.sources.filter((s) => (paths[s.id] ?? "keep") !== "keep").length
    : 0;
  const migrationHours = scenario
    ? scenario.sources.reduce(
        (n, s) => n + ((paths[s.id] ?? "keep") === "migrate" ? s.migrationEffortHours : 0),
        0,
      )
    : 0;

  const openSource = scenario?.sources.find((s) => s.id === openSourceId) ?? null;

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
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
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
                  design how each source feeds the step, then run the pipeline
                </div>
              </div>
              {scenario && phase === "design" && (
                <span style={countBadge}>{changedCount} changed</span>
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
                      <div style={{ marginTop: 12 }}>Pulling the sources…</div>
                    </>
                  )}
                </div>
              )}

              {scenario && phase === "design" && (
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

                  {/* path legend */}
                  <PathLegend />

                  {/* the sources */}
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <div style={kicker}>the sources feeding the step</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#6f8a83", whiteSpace: "nowrap" }}>
                      keep · redirect · migrate · exclude
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {scenario.sources.map((s) => (
                      <SourceCard
                        key={s.id}
                        source={s}
                        path={paths[s.id] ?? "keep"}
                        onChange={(v) => setPath(s.id, v)}
                        onView={() => setOpenSourceId(s.id)}
                      />
                    ))}
                  </div>

                  {/* live read */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 14,
                      border: "1px solid #dde7e4",
                      borderRadius: 12,
                      background: "#f6faf8",
                      padding: "10px 14px",
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "#26413b" }}>
                      migration effort: ≈ {migrationHours} hrs
                    </span>
                    <span style={{ fontSize: 12.5, color: "#6f8a83", flex: 1, minWidth: 200 }}>
                      Migrating is real work and introduces human error — only convert a source the step actually needs.
                    </span>
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
                      {submitting ? "RUNNING…" : "RUN THE PIPELINE →"}
                    </button>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: "#6f8a83" }}>
                      fewest errors wins — fix the intake, migrate what pays off
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
                    new task · {scenario.topic}
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
                    onClick={() => setPhase("design")}
                    style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}
                  >
                    SEE THE SOURCES →
                  </button>
                </div>
              </div>
            )}

            {/* SOURCE CONTENTS MODAL */}
            {openSource && (
              <SourceContentsModal source={openSource} onClose={() => setOpenSourceId(null)} />
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

function PathLegend() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        border: "1px solid #e3f1ed",
        borderRadius: 12,
        background: "#fbfdfc",
        padding: "10px 12px",
      }}
    >
      {PATH_OPTIONS.map((p) => (
        <div key={p.value} style={{ display: "flex", alignItems: "center", gap: 7, flex: "1 1 240px", minWidth: 0 }}>
          <span
            style={{
              flex: "none",
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 12,
              color: "#fff",
              background: p.color,
              borderRadius: 6,
              width: 20,
              height: 20,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {p.icon}
          </span>
          <span style={{ fontSize: 12.5, color: "#26413b", lineHeight: 1.3 }}>
            <b>{p.label}</b> — {p.desc}
          </span>
        </div>
      ))}
    </div>
  );
}

function SourceCard({
  source,
  path,
  onChange,
  onView,
}: {
  source: SourceView;
  path: SourcePath;
  onChange: (v: SourcePath) => void;
  onView: () => void;
}) {
  const touched = path !== "keep";
  const meta = TYPE_META[source.type];
  return (
    <div
      style={{
        border: `1.5px solid ${touched ? PATH_META[path].color : "#dde7e4"}`,
        borderRadius: 13,
        padding: "13px 15px",
        background: touched ? `color-mix(in srgb, ${PATH_META[path].color} 6%, #fff)` : "#fff",
        transition: "border-color .14s, background .14s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15 }}>{meta.icon}</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: "#162824" }}>{source.label}</span>
            <span style={typePill}>{meta.label}</span>
            <span style={dataPill}>{source.volume.toLocaleString()}/qtr</span>
            <span style={dataPill}>{source.ongoing ? "ongoing" : "archive"}</span>
          </div>
          <div style={{ fontSize: 13.5, color: "#26413b", lineHeight: 1.45 }}>{source.summary}</div>
          <div style={{ fontSize: 12.5, color: "#6f8a83", lineHeight: 1.4, marginTop: 5 }}>
            ↳ the step uses this: {source.usedFor}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 9, flexWrap: "wrap" }}>
            <button onClick={onView} style={viewBtn}>
              🔍 View contents
            </button>
            {path === "migrate" && (
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: ACCENT, fontWeight: 700 }}>
                migration ≈ {source.migrationEffortHours} hrs
              </span>
            )}
            {path === "redirect" && (
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: BLUE, fontWeight: 700 }}>
                → new intake structured; old data left as-is
              </span>
            )}
            {path === "exclude" && (
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: RED, fontWeight: 700 }}>
                → left out of the step
              </span>
            )}
          </div>
        </div>
        <PathSegmented value={path} onChange={onChange} />
      </div>
    </div>
  );
}

function PathSegmented({
  value,
  onChange,
}: {
  value: SourcePath;
  onChange: (v: SourcePath) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        flex: "none",
        flexWrap: "wrap",
        border: "1px solid #dde7e4",
        borderRadius: 10,
        overflow: "hidden",
        background: "#f1f9f6",
      }}
    >
      {PATH_OPTIONS.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.desc}
            style={{
              fontFamily: MONO,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: ".02em",
              color: on ? "#fff" : "#5b7269",
              background: on ? opt.color : "transparent",
              border: "none",
              padding: "8px 11px",
              cursor: "pointer",
              whiteSpace: "nowrap",
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

function SourceContentsModal({
  source,
  onClose,
}: {
  source: SourceView;
  onClose: () => void;
}) {
  const meta = TYPE_META[source.type];
  return (
    <div style={overlay("fixed")} onClick={onClose}>
      <div style={{ ...modalCard(560) }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <span style={{ fontSize: 19 }}>{meta.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>{source.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: "#6f8a83" }}>
                {meta.label} · {source.volume.toLocaleString()}/qtr · {source.ongoing ? "ongoing" : "archive"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <div style={{ fontSize: 13.5, color: "#26413b", lineHeight: 1.45, margin: "12px 0 4px" }}>
          {source.summary}
        </div>
        <div style={{ marginTop: 12 }}>
          <PreviewBlock preview={source.preview} />
        </div>
        <div style={{ fontSize: 12.5, color: "#6f8a83", lineHeight: 1.4, marginTop: 12 }}>
          ↳ the step uses this for: {source.usedFor}
        </div>
      </div>
    </div>
  );
}

function PreviewBlock({ preview }: { preview: SourcePreview }) {
  if (preview.columns && preview.rows) {
    return (
      <div style={{ overflowX: "auto", border: "1px solid #dde7e4", borderRadius: 11 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: MONO, fontSize: 12 }}>
          <thead>
            <tr>
              {preview.columns.map((c, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left",
                    padding: "8px 11px",
                    background: "#f1f9f6",
                    borderBottom: "1px solid #dde7e4",
                    color: "#4f6c64",
                    whiteSpace: "nowrap",
                    fontWeight: 700,
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "8px 11px",
                      borderBottom: ri === preview.rows!.length - 1 ? "none" : "1px solid #eef3f1",
                      color: cell === "" ? "#c0563a" : "#26413b",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cell === "" ? "— blank —" : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (preview.messages) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {preview.messages.map((m, i) => (
          <div key={i} style={{ border: "1px solid #dde7e4", borderRadius: 11, padding: "10px 13px", background: "#fff" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: "#4f6c64" }}>{m.from}</span>
              {m.subject && <span style={{ fontSize: 12.5, fontWeight: 700, color: "#162824" }}>{m.subject}</span>}
            </div>
            <div style={{ fontSize: 13, color: "#26413b", lineHeight: 1.45, marginTop: 4 }}>{m.body}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      style={{
        border: "1px dashed #cdbf9f",
        borderRadius: 11,
        padding: "13px 15px",
        background: "#fdfaf2",
        fontSize: 13.5,
        color: "#5b5230",
        lineHeight: 1.5,
      }}
    >
      {preview.note ?? "No readable preview — this source isn't in a shape the step can open."}
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

const typePill: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: "#6f8a83",
  background: "#f1f9f6",
  border: "1px solid #d7e8e3",
  borderRadius: 999,
  padding: "1px 8px",
};

const dataPill: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: ".03em",
  color: "#7c8f89",
  background: "#fbfdfc",
  border: "1px solid #e3eeeb",
  borderRadius: 999,
  padding: "1px 8px",
};

const viewBtn: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: ".02em",
  color: "#26413b",
  background: "#f1f9f6",
  border: "1px solid #cfe6e0",
  borderRadius: 8,
  padding: "6px 11px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const closeBtn: React.CSSProperties = {
  flex: "none",
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 700,
  color: "#6f8a83",
  background: "#f1f9f6",
  border: "1px solid #cfe6e0",
  borderRadius: 8,
  width: 30,
  height: 30,
  cursor: "pointer",
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
      <div style={{ ...modalCard(960), padding: "26px 28px", display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap" }}>
        <VideoPlaceholder script={EXPLAINER_SCRIPTS["clean-the-pipe"]} accent={ACCENT} />
        <div style={{ flex: "1 1 380px", minWidth: 0 }}>
        <div style={modalKicker}>how to play</div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: "-0.015em", margin: "8px 0 0" }}>
          Clean the Pipe
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#26413b", marginTop: 10 }}>
          An AI step is fed by several <b>data sources</b> — a database, an inbox, spreadsheets,
          scans — and the way data flows in is what&apos;s wrong. For each source, decide how it
          should feed the step: <b>keep</b> it as-is, <b>redirect</b> the intake so new data
          arrives structured, <b>migrate</b> the existing data into shape, or <b>exclude</b> it.
          Then <b>run the pipeline</b> and see the errors.
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
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>🔧</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#26413b" }}>
            <b style={{ color: ACCENT }}>Fewest errors wins — and human errors count.</b> Often the
            fix is to <b>redirect the channel</b> going forward (don&apos;t re-process the old
            backlog). Historical data you actually need must be <b>migrated</b> — but migration is
            real work that introduces its own mistakes, so <b>don&apos;t migrate a source that
            doesn&apos;t earn it</b>. Click <b>View contents</b> to read each source before you
            decide.
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
                <li>Designing how data is fed into an AI step, source by source.</li>
                <li>Fixing the intake going forward vs migrating historical data.</li>
                <li>Spending migration effort only where it lowers errors.</li>
              </ul>
              <p style={{ marginTop: 0, fontWeight: 600 }}>How you score:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>The pipeline is <b>simulated</b> and scored on total <b>errors</b> — AI misreads, human migration mistakes, and dropped data.</li>
                <li>Leaving a needed source feeding garbage <b>poisons the output</b> and caps you below the clear.</li>
                <li>Migrating a source that didn&apos;t need it <b>adds human errors</b> — over-building fails too.</li>
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

const VERDICT_META: Record<SourceVerdict, { tone: Tone; tag: string }> = {
  best: { tone: "good", tag: "best path" },
  ok: { tone: "good", tag: "acceptable" },
  poisoned: { tone: "bad", tag: "left poisoning the output" },
  wasteful: { tone: "warn", tag: "migration didn't pay off" },
};

const TONE_COLOR: Record<Tone, { c: string; bg: string; b: string }> = {
  good: { c: GREEN, bg: "#eef7ec", b: "#cfe6d4" },
  bad: { c: RED, bg: "#fdf1ee", b: "#efd2c9" },
  warn: { c: AMBER, bg: "#fdf8ee", b: "#efe2c9" },
};

/** The scored simulation: three pipeline runs compared by error count. */
function SimulationChart({ sim }: { sim: ScoreResult["simulation"] }) {
  const max = Math.max(sim.baseline.total, sim.yours.total, sim.best.total, 1);
  const rows: { title: string; col: SimColumn; accent: boolean }[] = [
    { title: "Do nothing (status quo)", col: sim.baseline, accent: false },
    { title: "Your redesign", col: sim.yours, accent: true },
    { title: "Best possible", col: sim.best, accent: false },
  ];
  const SEG: { key: keyof SimColumn; label: string; color: string }[] = [
    { key: "ai", label: "AI misreads", color: "#c0563a" },
    { key: "human", label: "Human errors", color: "#c9933f" },
    { key: "omission", label: "Dropped data", color: "#6f8a83" },
  ];
  return (
    <div style={{ marginTop: 24 }}>
      <div style={kicker}>The pipeline, simulated — errors per quarter</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {rows.map((r) => (
          <div
            key={r.title}
            style={{
              border: `1px solid ${r.accent ? "color-mix(in srgb, #1f9488 35%, #cfe6e0)" : "#dde7e4"}`,
              borderRadius: 12,
              padding: "11px 13px",
              background: r.accent ? "color-mix(in srgb, #1f9488 4%, #fff)" : "#fff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color: r.accent ? ACCENT : "#6f8a83" }}>
                {r.title}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: "#162824" }}>
                {r.col.total.toLocaleString()} <span style={{ fontSize: 11, color: "#6f8a83" }}>errors</span>
              </span>
            </div>
            <div
              style={{
                display: "flex",
                height: 14,
                marginTop: 8,
                borderRadius: 7,
                overflow: "hidden",
                background: "#f1f5f4",
                width: `${Math.max(6, (r.col.total / max) * 100)}%`,
                minWidth: 6,
              }}
            >
              {SEG.map((s) => {
                const v = r.col[s.key];
                if (v <= 0) return null;
                return <div key={s.key} style={{ width: `${(v / r.col.total) * 100}%`, background: s.color }} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
        {SEG.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, color: "#5b7269" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} /> {s.label}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: "#9ab3ac", margin: "10px 0 0", fontStyle: "italic" }}>
        Your score is how far your redesign cut errors from the status quo toward the best possible — human migration errors included.
      </p>
    </div>
  );
}

/** The before-vs-after deliverable narration (illustrative). */
function OutputContrast({ output }: { output: ScoreResult["output"] }) {
  const cols: { title: string; text: string; accent: boolean }[] = [
    { title: "Status-quo output", text: output.before, accent: false },
    { title: "After your redesign", text: output.after, accent: true },
  ];
  return (
    <div style={{ marginTop: 24 }}>
      <div style={kicker}>What the step produced — before vs after</div>
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
                padding: "9px 13px",
                borderBottom: "1px solid #eef3f1",
                background: "#f6faf8",
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".03em",
                textTransform: "uppercase",
                color: c.accent ? ACCENT : "#6f8a83",
              }}
            >
              {c.title}
            </div>
            <div style={{ padding: "12px 13px", fontSize: 13.5, lineHeight: 1.5, color: "#26413b" }}>{c.text}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: "#9ab3ac", margin: "8px 0 0", fontStyle: "italic" }}>
        Illustrative — shows what your pipeline design did to the deliverable. It never affects your score.
      </p>
    </div>
  );
}

function SourceReviewRow({ source }: { source: ResultSource }) {
  const v = VERDICT_META[source.verdict];
  const t = TONE_COLOR[v.tone];
  const ok = v.tone === "good";
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
          <span style={{ fontSize: 14.5, fontWeight: 700, color: "#162824" }}>
            {TYPE_META[source.type].icon} {source.label}
          </span>
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
            {v.tag}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 5 }}>
          <PathChip path={source.path} prefix="you" />
          {source.path !== source.bestPath && <PathChip path={source.bestPath} prefix="best" />}
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#7c8f89" }}>
            {source.yourErrors.toLocaleString()} errors{source.path !== source.bestPath ? ` · best ${source.bestErrors.toLocaleString()}` : ""}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#4f6c64", marginTop: 5, lineHeight: 1.45 }}>{source.reason}</div>
      </div>
    </div>
  );
}

function PathChip({ path, prefix }: { path: SourcePath; prefix: string }) {
  const m = PATH_META[path];
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".03em",
        color: m.color,
        background: `color-mix(in srgb, ${m.color} 10%, #fff)`,
        border: `1px solid color-mix(in srgb, ${m.color} 35%, #fff)`,
        borderRadius: 999,
        padding: "2px 9px",
      }}
    >
      {prefix}: {m.label.toLowerCase()}
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
  const noPoison = !result.gateTripped;
  const noWaste = result.overMigrated === 0;

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
        <Verdict ok={noPoison} label={noPoison ? "no poisoned output" : "left a source poisoning the output"} />
        <Verdict ok={noWaste} label={noWaste ? "no wasted migrations" : "migrated what didn't pay off"} />
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
        {statCard("#cfe6e0", "#f1f9f6", "#162824", `${result.errorReduction}%`, "errors cut vs status quo")}
        {statCard("#cfe6e0", "#f1f9f6", "#162824", `${result.bestPicks}/${result.sourcesTotal}`, "sources on best path")}
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

      {/* the scored simulation */}
      <SimulationChart sim={result.simulation} />

      {/* what the step produced, before vs after */}
      <OutputContrast output={result.output} />

      {/* per-source breakdown */}
      <div style={{ ...kicker, marginTop: 24 }}>The sources, reviewed</div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 9 }}>
        {result.sources.map((s) => (
          <SourceReviewRow key={s.id} source={s} />
        ))}
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
  const poisoned = history.filter((h) => h.gateTripped).length;
  const lowReduction = history.filter((h) => !h.gateTripped && h.errorReduction < 100).length;
  const hints: string[] = [];
  if (poisoned > 0) {
    hints.push(
      `You left a needed source feeding garbage on ${poisoned} round${poisoned === 1 ? "" : "s"} — that poisons the output and caps you below the clear. A messy or wrong-type source the step relies on has to be migrated, not kept.`,
    );
  }
  if (lowReduction > 0) {
    hints.push(
      `On ${lowReduction} round${lowReduction === 1 ? "" : "s"} you left errors on the table — either by not redirecting a messy live channel, or by migrating a source that didn't earn it (which adds human errors). Match the path to the source.`,
    );
  }
  hints.push(
    "The skill is integration design: keep what's clean, redirect messy live channels going forward, migrate the historical data you genuinely need, and exclude the rest.",
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
          {avg >= 85 ? "Pipeline Architect 🏆" : avg >= 65 ? "Solid plumbing 🔧" : "Keep practising 🔁"}
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
            Sharp integration design — you kept what was clean, redirected the messy channels, migrated only what paid off, and dropped the rest.
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
