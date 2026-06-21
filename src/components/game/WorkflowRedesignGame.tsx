"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import {
  CAPABILITIES,
  CAPABILITY_BY_KIND,
  IMPL_TIERS,
  IMPL_BY_TIER,
} from "@/lib/workflow-redesign-blocks";
import type {
  CapabilityKind,
  CheckpointKind,
  ImplTier,
} from "@/lib/workflow-redesign-scoring";

const ACCENT = "#0d9488"; // teal — distinct from the other games
const DISPLAY = "var(--font-bricolage), sans-serif";
const BODY = "var(--font-hanken), system-ui, sans-serif";
const MONO = "var(--font-space-mono), monospace";
const GREEN = "#1f8a5b";
const RED = "#c0563a";
const AMBER = "#c9933f";

export interface RoundRef {
  id: string;
  scenarioKey: string;
}

interface Stage {
  id: string;
  name: string;
  painPoint: string;
  timeCost: string;
}
interface SafeScenario {
  topic: string;
  scenarioKey: string;
  workflowName: string;
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  goal: string;
  stages: Stage[];
}

interface StageDesign {
  capability: CapabilityKind | null;
  impl: ImplTier | null;
  checkpoint: boolean;
}

interface ResultStage {
  id: string;
  name: string;
  painPoint: string;
  timeCost: string;
  rationale: string;
  bestCapability: CapabilityKind;
  bestImpl: ImplTier;
  checkpointKind: CheckpointKind;
  chosenCapability: CapabilityKind | null;
  chosenImpl: ImplTier | null;
  checkpointed: boolean;
  capabilityOk: boolean;
  implOk: boolean;
}

interface Critique {
  headline: string;
  technical: string;
  governance: string;
}

interface ScoreResult {
  score: number;
  maxScore: number;
  redesign: number;
  governance: number;
  buildJudgment: number;
  coverage: number;
  efficiency: number;
  stagesAddressed: number;
  stagesTotal: number;
  allAddressed: boolean;
  criticalTotal: number;
  criticalCheckpointed: number;
  overCheckpointed: number;
  gatePassed: boolean;
  stages: ResultStage[];
  workflowName: string;
  goal: string;
  critique: Critique;
  explanation: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "setup" | "ideation" | "build";

interface HistoryEntry {
  score: number;
  xp: number;
  redesign: number;
  governance: number;
  buildJudgment: number;
  exceptional: boolean;
}

function emptyDesign(): StageDesign {
  return { capability: null, impl: null, checkpoint: false };
}

export function WorkflowRedesignGame({ rounds }: { rounds: RoundRef[] }) {
  const router = useRouter();
  const total = rounds.length || 2;

  const [roundIndex, setRoundIndex] = useState(0);
  const [screen, setScreen] = useState<"play" | "results" | "summary">("play");
  const [phase, setPhase] = useState<Phase>("intro");
  const [scenario, setScenario] = useState<SafeScenario | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Build state, keyed by stage id.
  const [design, setDesign] = useState<Record<string, StageDesign>>({});
  const [activeCap, setActiveCap] = useState<CapabilityKind | null>(null);

  // Ideation state.
  const [notes, setNotes] = useState("");
  const [insights, setInsights] = useState<string[] | null>(null);
  const [ideating, setIdeating] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // ---- round prefetch (both scenarios warmed behind the intro, sequentially,
  // so each can be told the topics already used and pick a fresh theme) ----
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
        const res = await fetch("/api/games/workflow-redesign/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: round.id,
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

  const loadRound = useCallback(
    async (index: number) => {
      const round = rounds[index];
      if (!round) return;
      setScreen("play");
      setPhase("loading");
      setScenario(null);
      setRoundId(null);
      setResult(null);
      setDesign({});
      setNotes("");
      setInsights(null);
      setLoadError(null);
      try {
        const data = await prefetchRound(index);
        setScenario(data.scenario);
        setRoundId(data.roundId);
        const init: Record<string, StageDesign> = {};
        for (const s of data.scenario.stages) init[s.id] = emptyDesign();
        setDesign(init);
        setPhase("setup");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load round");
      }
    },
    [rounds, prefetchRound],
  );

  // ---- ideation ----
  const synthesise = useCallback(async () => {
    if (!roundId) return;
    setIdeating(true);
    try {
      const res = await fetch("/api/games/workflow-redesign/ideate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, notes }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as { insights: string[] };
      setInsights(data.insights);
    } catch {
      setInsights([
        "Match each bottleneck to the AI capability that fits it, then choose the lightest implementation that does the job.",
        "Keep a human in the loop wherever a decision becomes irreversible or reaches a real person.",
      ]);
    } finally {
      setIdeating(false);
    }
  }, [roundId, notes]);

  // ---- build canvas helpers ----
  const setCapability = useCallback((stageId: string, cap: CapabilityKind) => {
    setDesign((prev) => ({
      ...prev,
      [stageId]: { ...(prev[stageId] ?? emptyDesign()), capability: cap },
    }));
  }, []);
  const setImpl = useCallback((stageId: string, impl: ImplTier) => {
    setDesign((prev) => ({
      ...prev,
      [stageId]: { ...(prev[stageId] ?? emptyDesign()), impl },
    }));
  }, []);
  const toggleCheckpoint = useCallback((stageId: string) => {
    setDesign((prev) => ({
      ...prev,
      [stageId]: {
        ...(prev[stageId] ?? emptyDesign()),
        checkpoint: !(prev[stageId]?.checkpoint ?? false),
      },
    }));
  }, []);
  const clearStage = useCallback((stageId: string) => {
    setDesign((prev) => ({ ...prev, [stageId]: emptyDesign() }));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const onDragStart = useCallback((e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith("cap:")) setActiveCap(id.slice(4) as CapabilityKind);
  }, []);
  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveCap(null);
      const { active, over } = e;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId.startsWith("cap:") && overId.startsWith("stage:")) {
        setCapability(overId.slice(6), activeId.slice(4) as CapabilityKind);
      }
    },
    [setCapability],
  );

  const stages = scenario?.stages ?? [];
  const allAssigned =
    stages.length > 0 &&
    stages.every((s) => design[s.id]?.capability && design[s.id]?.impl);

  const submit = useCallback(async () => {
    if (!roundId || !scenario) return;
    setSubmitting(true);
    try {
      const builds = scenario.stages.map((s) => ({
        stageId: s.id,
        capability: design[s.id]?.capability ?? null,
        impl: design[s.id]?.impl ?? null,
        checkpoint: design[s.id]?.checkpoint ?? false,
      }));
      const res = await fetch("/api/games/workflow-redesign/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, builds }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ScoreResult;
      setResult(data);
      setHistory((h) => [
        ...h,
        {
          score: data.score,
          xp: data.xpEarned + data.bonusXp,
          redesign: data.redesign,
          governance: data.governance,
          buildJudgment: data.buildJudgment,
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
  }, [roundId, scenario, design, router]);

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
    setDesign({});
    setNotes("");
    setInsights(null);
  }, []);

  // ===================== RENDER =====================
  const pageStyle: React.CSSProperties = {
    ["--accent" as string]: ACCENT,
    minHeight: "100vh",
    background: "radial-gradient(120% 80% at 80% -10%, #e6f5f2 0%, #e2f0ee 55%)",
    fontFamily: BODY,
    color: "#13211f",
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
            borderBottom: "1px solid #c9e3de",
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
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, #cfe5e0)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="7" height="7" rx="1.5" stroke="#13211f" strokeWidth="1.7" />
                  <rect x="14" y="13" width="7" height="7" rx="1.5" stroke={ACCENT} strokeWidth="1.7" />
                  <path d="M10 7h4a3 3 0 0 1 3 3v3" stroke={ACCENT} strokeWidth="1.7" strokeLinecap="round" />
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
                Workflow Redesign
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={chipStyle}>
              SCENARIO {Math.min(roundIndex + 1, total)} / {total}
            </span>
            <button onClick={restart} style={{ ...chipStyle, cursor: "pointer" }}>
              ↻ REPLAY
            </button>
          </div>
        </div>

        {/* ===== INTRO ===== */}
        {screen === "play" && phase === "intro" && (
          <IntroModal onStart={() => loadRound(0)} />
        )}

        {/* ===== PHASE RAIL + BODY ===== */}
        {screen === "play" && phase !== "intro" && (
          <div
            style={{
              position: "relative",
              border: "1px solid #cfe5e0",
              borderRadius: 22,
              background: "#fffdfb",
              boxShadow: "0 22px 50px -28px rgba(16,40,38,.4)",
              overflow: "hidden",
            }}
          >
            <PhaseRail phase={phase} workflowName={scenario?.workflowName} />

            <div style={{ padding: "22px 22px 22px", minHeight: 380 }}>
              {/* loading */}
              {phase === "loading" && (
                <div
                  style={{
                    margin: "60px auto",
                    textAlign: "center",
                    fontFamily: MONO,
                    fontSize: 13,
                    color: "#5d7c77",
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
                      <div style={{ marginTop: 12 }}>Mapping the current workflow…</div>
                    </>
                  )}
                </div>
              )}

              {/* SETUP */}
              {phase === "setup" && scenario && (
                <SetupView scenario={scenario} onNext={() => setPhase("ideation")} />
              )}

              {/* IDEATION */}
              {phase === "ideation" && scenario && (
                <IdeationView
                  scenario={scenario}
                  notes={notes}
                  setNotes={setNotes}
                  insights={insights}
                  ideating={ideating}
                  onSynthesise={synthesise}
                  onContinue={() => setPhase("build")}
                />
              )}

              {/* BUILD */}
              {phase === "build" && scenario && (
                <DndContext
                  sensors={sensors}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                >
                  <BuildView
                    scenario={scenario}
                    design={design}
                    setImpl={setImpl}
                    toggleCheckpoint={toggleCheckpoint}
                    clearStage={clearStage}
                    allAssigned={allAssigned}
                    submitting={submitting}
                    onSubmit={submit}
                    loadError={loadError}
                  />
                  <DragOverlay dropAnimation={null}>
                    {activeCap ? <CapabilityChip kind={activeCap} dragging /> : null}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
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

        {/* ===== SUMMARY ===== */}
        {screen === "summary" && (
          <FinalSummary history={history} total={total} onReplay={restart} />
        )}
      </div>
    </div>
  );
}

// ===================== phase rail =====================

const PHASES: { key: Phase; label: string }[] = [
  { key: "setup", label: "Setup" },
  { key: "ideation", label: "Ideation" },
  { key: "build", label: "Build" },
];

function PhaseRail({ phase, workflowName }: { phase: Phase; workflowName?: string }) {
  const order = ["setup", "ideation", "build"];
  const activeIdx = order.indexOf(phase);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 20px",
        borderBottom: "1px solid #ddefeb",
        background: "#f2faf8",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
          {workflowName ?? "Workflow"}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "#5d7c77", letterSpacing: ".02em" }}>
          redesign it around AI&apos;s strengths
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {PHASES.map((p, i) => {
          const done = activeIdx > i;
          const active = activeIdx === i;
          return (
            <span
              key={p.key}
              style={{
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".03em",
                textTransform: "uppercase",
                color: active ? "#fff" : done ? ACCENT : "#8aa6a1",
                background: active ? ACCENT : done ? "#dcf0ec" : "#eef6f4",
                border: `1px solid ${active || done ? "color-mix(in srgb, var(--accent) 40%, #cfe5e0)" : "#dcebe8"}`,
                borderRadius: 999,
                padding: "5px 11px",
                whiteSpace: "nowrap",
              }}
            >
              {i + 1}. {p.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ===================== setup =====================

function SetupView({ scenario, onNext }: { scenario: SafeScenario; onNext: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* the brief, as a DM */}
      <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
        <div
          style={{
            width: 46,
            height: 46,
            flex: "none",
            borderRadius: "50%",
            background: "linear-gradient(135deg,#0d9488,#34b3a6)",
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, lineHeight: 1.1 }}>
            {scenario.brief.senderName}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#5d7c77", marginBottom: 8 }}>
            {scenario.brief.senderRole}
          </div>
          <div
            style={{
              fontSize: 15.5,
              lineHeight: 1.55,
              border: "1px solid #cfe5e0",
              borderRadius: 14,
              padding: "13px 15px",
              background: "#f2faf8",
              color: "#2c423e",
            }}
          >
            {scenario.brief.message}
          </div>
        </div>
      </div>

      {/* the goal */}
      <div style={{ border: "1px solid #ddefeb", borderRadius: 14, background: "#f2faf8", padding: "13px 15px" }}>
        <div style={kicker}>the goal</div>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: "#13211f" }}>🎯 {scenario.goal}</div>
      </div>

      {/* current state */}
      <div style={kicker}>the current workflow · today, by hand</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {scenario.stages.map((s, i) => {
          const last = i === scenario.stages.length - 1;
          return (
            <div key={s.id} style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: 26 }}>
                <div style={railNode(false)}>{i + 1}</div>
                {!last && <div style={{ flex: 1, width: 2, background: "#cfe5e0", minHeight: 14 }} />}
              </div>
              <div
                style={{
                  flex: 1,
                  border: "1px solid #dde9e6",
                  borderRadius: 13,
                  padding: "12px 15px",
                  marginBottom: 12,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#13211f" }}>{s.name}</div>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: AMBER, whiteSpace: "nowrap" }}>
                    ⏱ {s.timeCost}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "#4a615d", marginTop: 4, lineHeight: 1.45 }}>{s.painPoint}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <button onClick={onNext} style={primaryBtn}>
          MAP THE BOTTLENECKS →
        </button>
      </div>
    </div>
  );
}

// ===================== ideation =====================

function IdeationView({
  scenario,
  notes,
  setNotes,
  insights,
  ideating,
  onSynthesise,
  onContinue,
}: {
  scenario: SafeScenario;
  notes: string;
  setNotes: (s: string) => void;
  insights: string[] | null;
  ideating: boolean;
  onSynthesise: () => void;
  onContinue: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={kicker}>think it through</div>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: "#2c423e", margin: 0 }}>
          Before you rebuild <b>{scenario.workflowName}</b>, analyse it in your own words. Where is
          time lost? Which steps are judgement calls and which are mechanical? Where could AI add
          value — and where must a human stay accountable?
        </p>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Reading documents by hand is the biggest drain… the right-to-work check is a judgement call we can't fully automate…"
        rows={5}
        style={{
          width: "100%",
          fontFamily: BODY,
          fontSize: 15,
          lineHeight: 1.5,
          color: "#13211f",
          border: "1.5px solid #cfe5e0",
          borderRadius: 14,
          padding: "13px 15px",
          background: "#fff",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={onSynthesise}
          disabled={ideating}
          style={{ ...secondaryBtn, opacity: ideating ? 0.6 : 1, cursor: ideating ? "default" : "pointer" }}
        >
          {ideating ? "SYNTHESISING…" : insights ? "↻ RE-SYNTHESISE" : "SYNTHESISE MY THINKING"}
        </button>
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#5d7c77" }}>
          AI turns your notes into sharp insights — unscored, just to prime your build
        </span>
      </div>

      {insights && (
        <div
          style={{
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 32%, #cfe5e0)`,
            background: `color-mix(in srgb, ${ACCENT} 6%, #fffdfb)`,
            borderRadius: 16,
            padding: "15px 17px",
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: ACCENT, textTransform: "uppercase", marginBottom: 10 }}>
            Insights to carry into the build
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            {insights.map((h, i) => (
              <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, color: "#2c423e" }}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button onClick={onContinue} style={primaryBtn}>
          BUILD THE REDESIGN →
        </button>
      </div>
    </div>
  );
}

// ===================== build canvas =====================

function CapabilityChip({ kind, dragging }: { kind: CapabilityKind; dragging?: boolean }) {
  const info = CAPABILITY_BY_KIND[kind];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: BODY,
        fontSize: 14,
        fontWeight: 700,
        color: "#0b3d38",
        background: dragging ? "color-mix(in srgb, var(--accent) 22%, #fff)" : "#e7f5f2",
        border: `1.5px solid color-mix(in srgb, ${ACCENT} 38%, #cfe5e0)`,
        borderRadius: 11,
        padding: "9px 13px",
        boxShadow: dragging ? "0 14px 28px -12px rgba(13,148,136,.7)" : "none",
        cursor: "grab",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 16, color: ACCENT }}>{info.glyph}</span>
      {info.label}
    </div>
  );
}

function DraggableCapability({ kind }: { kind: CapabilityKind }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `cap:${kind}` });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.35 : 1, touchAction: "none" }}
    >
      <CapabilityChip kind={kind} />
    </div>
  );
}

function StageSlot({
  stage,
  index,
  last,
  d,
  setImpl,
  toggleCheckpoint,
  clearStage,
}: {
  stage: Stage;
  index: number;
  last: boolean;
  d: StageDesign;
  setImpl: (stageId: string, impl: ImplTier) => void;
  toggleCheckpoint: (stageId: string) => void;
  clearStage: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  const cap = d.capability ? CAPABILITY_BY_KIND[d.capability] : null;

  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: 26 }}>
        <div style={railNode(Boolean(cap))}>{index + 1}</div>
        {!last && <div style={{ flex: 1, width: 2, background: "#cfe5e0", minHeight: 14 }} />}
      </div>

      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          marginBottom: 12,
          border: `1.5px solid ${isOver ? ACCENT : cap ? "color-mix(in srgb, var(--accent) 32%, #cfe5e0)" : "#dde9e6"}`,
          borderRadius: 14,
          padding: "13px 15px",
          background: isOver ? "color-mix(in srgb, var(--accent) 10%, #fff)" : cap ? "color-mix(in srgb, var(--accent) 5%, #fff)" : "#fff",
          transition: "border-color .14s, background .14s",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#13211f" }}>{stage.name}</div>
          <span style={{ fontFamily: MONO, fontSize: 11, color: AMBER, whiteSpace: "nowrap" }}>⏱ {stage.timeCost}</span>
        </div>
        <div style={{ fontSize: 13.5, color: "#4a615d", marginTop: 3, lineHeight: 1.4 }}>{stage.painPoint}</div>

        {/* capability target */}
        {!cap ? (
          <div
            style={{
              marginTop: 11,
              border: `1.5px dashed ${isOver ? ACCENT : "#bcd6d1"}`,
              borderRadius: 11,
              padding: "12px 14px",
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 12,
              color: isOver ? ACCENT : "#7c9a95",
              background: isOver ? "color-mix(in srgb, var(--accent) 8%, #fff)" : "#f7fbfa",
            }}
          >
            {isOver ? "drop to assign →" : "drag a capability block here"}
          </div>
        ) : (
          <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <CapabilityChip kind={d.capability!} />
              <button
                onClick={() => clearStage(stage.id)}
                style={{ ...miniBtn, color: "#7c9a95" }}
                title="remove block"
              >
                ✕ clear
              </button>
            </div>

            {/* implementation tier */}
            <div>
              <div style={{ ...miniLabel }}>implementation</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {IMPL_TIERS.map((t) => {
                  const on = d.impl === t.tier;
                  return (
                    <button
                      key={t.tier}
                      onClick={() => setImpl(stage.id, t.tier)}
                      title={t.blurb}
                      style={{
                        fontFamily: MONO,
                        fontSize: 11.5,
                        fontWeight: 700,
                        letterSpacing: ".01em",
                        color: on ? "#fff" : "#3a5450",
                        background: on ? ACCENT : "#eef6f4",
                        border: `1.5px solid ${on ? ACCENT : "#d3e6e2"}`,
                        borderRadius: 9,
                        padding: "7px 11px",
                        cursor: "pointer",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {d.impl && (
                <div style={{ fontSize: 12.5, color: "#5d7c77", marginTop: 6, lineHeight: 1.4 }}>
                  {IMPL_BY_TIER[d.impl].blurb}
                </div>
              )}
            </div>

            {/* checkpoint */}
            <button
              onClick={() => toggleCheckpoint(stage.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                alignSelf: "flex-start",
                fontFamily: MONO,
                fontSize: 11.5,
                fontWeight: 700,
                color: d.checkpoint ? "#fff" : "#3a5450",
                background: d.checkpoint ? ACCENT : "#eef6f4",
                border: `1.5px solid ${d.checkpoint ? ACCENT : "#d3e6e2"}`,
                borderRadius: 9,
                padding: "7px 12px",
                cursor: "pointer",
              }}
            >
              {d.checkpoint ? "🧑 human reviews here ✓" : "+ add human checkpoint"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BuildView({
  scenario,
  design,
  setImpl,
  toggleCheckpoint,
  clearStage,
  allAssigned,
  submitting,
  onSubmit,
  loadError,
}: {
  scenario: SafeScenario;
  design: Record<string, StageDesign>;
  setImpl: (stageId: string, impl: ImplTier) => void;
  toggleCheckpoint: (stageId: string) => void;
  clearStage: (stageId: string) => void;
  allAssigned: boolean;
  submitting: boolean;
  onSubmit: () => void;
  loadError: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* palette */}
      <div
        style={{
          position: "sticky",
          top: 8,
          zIndex: 5,
          border: "1px solid #ddefeb",
          borderRadius: 14,
          background: "#f2faf8",
          padding: "12px 14px",
        }}
      >
        <div style={{ ...miniLabel, marginBottom: 8 }}>capability blocks · drag onto a stage</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CAPABILITIES.map((c) => (
            <DraggableCapability key={c.kind} kind={c.kind} />
          ))}
        </div>
      </div>

      <div style={kicker}>your redesigned pipeline · assign a block, pick how it&apos;s built, gate where needed</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {scenario.stages.map((s, i) => (
          <StageSlot
            key={s.id}
            stage={s}
            index={i}
            last={i === scenario.stages.length - 1}
            d={design[s.id] ?? emptyDesign()}
            setImpl={setImpl}
            toggleCheckpoint={toggleCheckpoint}
            clearStage={clearStage}
          />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button
          onClick={onSubmit}
          disabled={submitting || !allAssigned}
          style={{
            ...primaryBtn,
            opacity: submitting || !allAssigned ? 0.5 : 1,
            cursor: submitting || !allAssigned ? "default" : "pointer",
          }}
        >
          {submitting ? "VALIDATING…" : "VALIDATE DESIGN →"}
        </button>
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#5d7c77" }}>
          {allAssigned
            ? "AI will critique it on technical & governance risk"
            : "assign a capability and implementation to every stage first"}
        </div>
      </div>
      {loadError && <div style={{ color: RED, fontFamily: MONO, fontSize: 12 }}>{loadError}</div>}
    </div>
  );
}

// ===================== shared style helpers =====================

const chipStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".04em",
  color: "#3a5450",
  background: "#eaf5f3",
  border: "1px solid #cfe5e0",
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
  color: "#3a5450",
  border: "1px solid #cfe5e0",
  background: "#eaf5f3",
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
  color: "#5d7c77",
  marginBottom: 2,
};

const miniLabel: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: "#7c9a95",
  marginBottom: 6,
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
  gap: 8,
  fontFamily: MONO,
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: ".03em",
  color: ACCENT,
  background: "#e7f5f2",
  border: `1.5px solid color-mix(in srgb, ${ACCENT} 36%, #cfe5e0)`,
  padding: "10px 16px",
  borderRadius: 10,
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "2px 4px",
};

function railNode(on: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: on ? ACCENT : "#eef6f4",
    border: `2px solid ${on ? ACCENT : "#cfe5e0"}`,
    color: on ? "#fff" : "#7c9a95",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 700,
    flex: "none",
  };
}

function overlay(): React.CSSProperties {
  return {
    ["--accent" as string]: ACCENT,
    position: "fixed",
    inset: 0,
    background: "rgba(11,40,38,.5)",
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
    border: "1px solid #cfe5e0",
    borderRadius: 20,
    boxShadow: "0 30px 60px -24px rgba(11,40,38,.6)",
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
  color: "#5d7c77",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

function Dots({ big }: { big?: boolean }) {
  const s = big ? 8 : 5;
  const dot = (delay: string): React.CSSProperties => ({
    width: s,
    height: s,
    borderRadius: "50%",
    background: big ? "#a9d4cd" : ACCENT,
    display: "inline-block",
    animation: `hg-dotPulse 1.1s infinite ${delay}`,
  });
  return (
    <span style={{ display: "inline-flex", gap: big ? 5 : 4 }}>
      <span style={dot("0s")} />
      <span style={dot(".22s")} />
      <span style={dot(".44s")} />
    </span>
  );
}

function statCard(border: string, bg: string, color: string, value: string, label: string) {
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 14, padding: "15px 16px", background: bg }}>
      <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "#3a5450", marginTop: 2 }}>{label}</div>
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

function IntroModal({ onStart }: { onStart: () => void }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  return (
    <div style={overlay()}>
      <div style={{ ...modalCard(540), padding: "26px 28px" }}>
        <div style={modalKicker}>how to play · the capstone</div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: "-0.015em", margin: "8px 0 0" }}>
          Workflow Redesign Challenge
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#2c423e", marginTop: 10 }}>
          You&apos;ve learned to prompt precisely, spot hallucinations, direct reasoning, calibrate
          context and keep a human in the loop. Now put it all together: take a real corporate
          workflow and <b>redesign it around AI</b> — not just faster, but rebuilt.
        </p>

        <ol style={{ margin: "14px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7, fontSize: 14.5, lineHeight: 1.45, color: "#2c423e" }}>
          <li><b>Setup</b> — read the current, hand-cranked workflow and where it&apos;s slow.</li>
          <li><b>Ideation</b> — analyse it in your own words; AI sharpens your thinking into insights.</li>
          <li><b>Build</b> — drag capability blocks onto each stage, pick how each is built, and add human checkpoints.</li>
          <li><b>Validate</b> — AI critiques your design on technical and governance risk.</li>
        </ol>

        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            marginTop: 16,
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 42%, #cfe5e0)`,
            background: `color-mix(in srgb, ${ACCENT} 8%, #fffdfb)`,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>🛠️</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#2c423e" }}>
            <b style={{ color: ACCENT }}>It&apos;s not about automating everything.</b> Match each
            bottleneck to the right capability, choose the <b>lightest build that does the job</b>{" "}
            (a custom app is powerful but only worth it at real volume or stakes), and keep a human
            wherever a decision is <b>irreversible or reaches a person</b>.
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #cfe5e0", borderRadius: 12, background: "#f2faf8", overflow: "hidden" }}>
          <div onClick={() => setRulesOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "12px 14px" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#5d7c77" }}>{rulesOpen ? "▾" : "▸"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#3a5450", textTransform: "uppercase" }}>
              How you score &amp; common rules
            </span>
          </div>
          {rulesOpen && (
            <div style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.5, color: "#2c423e" }}>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li><b>Redesign</b> is the gate — every bottleneck must get a capability that genuinely fits it.</li>
                <li><b>Governance</b> — guard every irreversible / person-affecting step, and don&apos;t over-gate the reversible ones.</li>
                <li><b>Build judgment</b> — pick the right implementation tier; over-engineering and under-powering both cost.</li>
              </ul>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                <li>Clear a scenario at <b>≥ 65%</b>; <b>≥ 70% / ≥ 85%</b> earn XP bonuses.</li>
                <li>This capstone runs <b>2 scenarios</b> and targets ~15 minutes.</li>
              </ul>
            </div>
          )}
        </div>

        <button onClick={onStart} style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}>
          START SCENARIO 1 →
        </button>
      </div>
    </div>
  );
}

// ===================== debrief =====================

function stageVerdict(s: ResultStage): {
  capTone: "good" | "warn" | "bad";
  implTone: "good" | "warn" | "bad";
  govOk: boolean;
  govLabel: string;
  govNote: string;
} {
  const capTone = s.capabilityOk
    ? s.chosenCapability === s.bestCapability
      ? "good"
      : "warn"
    : "bad";
  const implTone = !s.chosenImpl
    ? "bad"
    : s.chosenImpl === s.bestImpl
      ? "good"
      : s.implOk
        ? "warn"
        : "bad";

  let govOk = true;
  let govLabel = "fine either way";
  let govNote = "a judgement call — neutral either way";
  switch (s.checkpointKind) {
    case "critical":
      govOk = s.checkpointed;
      govLabel = "needed a human";
      govNote = s.checkpointed
        ? "guarded — you kept a human accountable for the irreversible call"
        : "left unguarded — an irreversible or person-affecting decision ran unchecked";
      break;
    case "trap":
      govOk = !s.checkpointed;
      govLabel = "looked risky";
      govNote = s.checkpointed
        ? "needless checkpoint — this was reversible/internal, so it only added drag"
        : "rightly left to run — it sounded high-stakes but was reversible";
      break;
    case "safe":
      govOk = !s.checkpointed;
      govLabel = "safe to automate";
      govNote = s.checkpointed ? "needless checkpoint — harmless, but it slows the flow" : "rightly automated";
      break;
  }
  return { capTone, implTone, govOk, govLabel, govNote };
}

function toneColor(t: "good" | "warn" | "bad") {
  return t === "good" ? GREEN : t === "warn" ? AMBER : RED;
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
  const addressedAll = result.allAddressed;
  const guardedAll = result.criticalCheckpointed >= result.criticalTotal;
  const stayedLean = result.overCheckpointed === 0;

  return (
    <div
      style={{
        border: "1px solid #cfe5e0",
        borderRadius: 22,
        background: "#fffdfb",
        boxShadow: "0 22px 50px -28px rgba(16,40,38,.4)",
        padding: "26px 28px",
        animation: "hg-slideUp .5s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28, letterSpacing: "-0.015em" }}>
          Scenario {roundNo} — validated
        </div>
        <span style={chipStyle}>SCENARIO {roundNo} / {total}</span>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <Verdict ok={addressedAll} label={addressedAll ? "every bottleneck addressed" : "a bottleneck unaddressed"} />
        <Verdict ok={guardedAll} label={guardedAll ? "governance covered" : "governance gap"} />
        <Verdict ok={stayedLean} label={stayedLean ? "no needless gates" : "over-gated"} />
        {result.exceptional && (
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: AMBER, background: "#fdf8ee", border: "1px solid #efe2c9", borderRadius: 999, padding: "5px 12px" }}>
            ★ exceptional
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 18 }}>
        {statCard(
          cleared ? "#cfe6d4" : "#efd2c9",
          cleared ? "#eef7ec" : "#fdf1ee",
          cleared ? GREEN : RED,
          `${Math.round((result.score / result.maxScore) * 100)}%`,
          cleared ? "cleared" : "below clear",
        )}
        {statCard("#cfe5e0", "#f2faf8", "#13211f", `${result.redesign}%`, "redesign (gate)")}
        {statCard("#cfe5e0", "#f2faf8", "#13211f", `${result.governance}%`, "governance")}
        {statCard("#cfe5e0", "#f2faf8", "#13211f", `${result.buildJudgment}%`, "build judgment")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: GREEN, fontWeight: 700 }}>+{result.xpEarned} XP</span>
        {result.bonusXp > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, color: AMBER, fontWeight: 700 }}>+{result.bonusXp} bonus ★</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#3a5450" }}>
          level {result.player.level} · {result.player.xp} XP
        </span>
      </div>

      {/* AI critique */}
      <div style={{ ...kicker, marginTop: 24 }}>AI review · {result.critique.headline}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
        <div style={critiqueCard}>
          <div style={critiqueLabel}>⚙️ Technical</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "#2c423e" }}>{result.critique.technical}</div>
        </div>
        <div style={critiqueCard}>
          <div style={critiqueLabel}>⚖️ Governance</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "#2c423e" }}>{result.critique.governance}</div>
        </div>
      </div>

      {/* per-stage breakdown */}
      <div style={{ ...kicker, marginTop: 24 }}>Stage by stage</div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 9 }}>
        {result.stages.map((s) => {
          const v = stageVerdict(s);
          return (
            <div key={s.id} style={{ border: "1px solid #dde9e6", borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: "#13211f" }}>{s.name}</span>
                <span style={pill(toneColor(v.capTone))}>
                  capability: {s.chosenCapability ? CAPABILITY_BY_KIND[s.chosenCapability].label : "none"}
                  {v.capTone !== "good" && ` → ${CAPABILITY_BY_KIND[s.bestCapability].label}`}
                </span>
                <span style={pill(toneColor(v.implTone))}>
                  build: {s.chosenImpl ? IMPL_BY_TIER[s.chosenImpl].label : "none"}
                  {v.implTone !== "good" && ` → ${IMPL_BY_TIER[s.bestImpl].label}`}
                </span>
                <span style={pill(v.govOk ? GREEN : RED)}>
                  {v.govOk ? "✓" : "✕"} {v.govLabel}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#5d7c77", marginTop: 5, lineHeight: 1.4 }}>
                {v.govNote}. {s.rationale}
              </div>
            </div>
          );
        })}
      </div>

      {/* why */}
      <div style={{ marginTop: 16, borderLeft: `3px solid ${ACCENT}`, padding: "2px 0 2px 13px", color: "#2c423e", fontSize: 15, lineHeight: 1.5 }}>
        {result.explanation}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
        <button onClick={onNext} style={{ ...primaryBtn, padding: "13px 24px" }}>
          {isLast ? "SEE SUMMARY →" : "NEXT SCENARIO →"}
        </button>
        <Link href="/" style={{ ...backChip, padding: "13px 20px", borderRadius: 12 }}>
          BACK TO ARCADE
        </Link>
      </div>
    </div>
  );
}

const critiqueCard: React.CSSProperties = {
  border: "1px solid #dde9e6",
  borderRadius: 14,
  padding: "13px 15px",
  background: "#f7fbfa",
};
const critiqueLabel: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: ACCENT,
  marginBottom: 7,
};

function pill(color: string): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: ".02em",
    color,
    border: `1px solid color-mix(in srgb, ${color} 35%, #dde9e6)`,
    borderRadius: 999,
    padding: "2px 8px",
  };
}

function buildImprovementHints(history: HistoryEntry[]): string[] {
  const hints: string[] = [];
  const weakRedesign = history.filter((h) => h.redesign < 100).length;
  const weakGov = history.filter((h) => h.governance < 100).length;
  const weakBuild = history.filter((h) => h.buildJudgment < 100).length;
  if (weakRedesign > 0)
    hints.push("Match every bottleneck to the capability that truly fits it — redesign is the gate, so an unaddressed step caps the whole scenario.");
  if (weakGov > 0)
    hints.push("Place human checkpoints exactly where a decision is irreversible or reaches a person — and resist gating the reversible steps that only sound risky.");
  if (weakBuild > 0)
    hints.push("Right-size the build: rules for the deterministic checks, an LLM for nuanced language, and a custom application only where real volume or stakes pay back the effort.");
  hints.push("The capstone skill is redesigning work around AI's strengths — and knowing when to call in IT for a custom build.");
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
  const avg = history.length ? Math.round(history.reduce((n, h) => n + h.score, 0) / history.length) : 0;
  const totalXp = history.reduce((n, h) => n + h.xp, 0);
  const cleared = history.filter((h) => h.score >= 65).length;
  const perfect = history.filter((h) => h.exceptional).length;
  const hints = avg < 90 ? buildImprovementHints(history) : [];

  return (
    <div style={overlay()}>
      <div style={{ ...modalCard(560), padding: "30px 28px", textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#5d7c77", textTransform: "uppercase" }}>
          capstone complete
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 33, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
          {avg >= 85 ? "Transformation Lead 🏆" : avg >= 65 ? "Workflow Architect 🛠️" : "Keep iterating 🔁"}
        </h2>
        <p style={{ fontSize: 15.5, color: "#3a5450", marginTop: 6 }}>
          You cleared <b style={{ color: "#13211f" }}>{cleared} of {total}</b> scenarios, with{" "}
          <b style={{ color: "#13211f" }}>{perfect}</b> exceptional.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 20, textAlign: "left" }}>
          {statCard("#cfe5e0", "#f2faf8", "#13211f", `${avg}%`, "average score")}
          {statCard("#cfe6d4", "#eef7ec", GREEN, `${cleared}/${total}`, "cleared (≥65%)")}
          {statCard("#efe2c9", "#fdf8ee", AMBER, `+${totalXp}`, "XP earned")}
        </div>

        {hints.length > 0 ? (
          <div style={{ marginTop: 22, border: "1.5px solid color-mix(in srgb, var(--accent) 32%, #cfe5e0)", background: "color-mix(in srgb, var(--accent) 6%, #fffdfb)", borderRadius: 16, padding: "16px 18px", textAlign: "left" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: ACCENT, textTransform: "uppercase", marginBottom: 10 }}>
              How to improve
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              {hints.map((h, i) => (
                <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, color: "#2c423e" }}>{h}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ fontSize: 14.5, color: GREEN, fontWeight: 600, marginTop: 18 }}>
            Outstanding — you redesigned work around AI&apos;s strengths, sized each build to its task, and kept humans accountable exactly where it counts.
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
