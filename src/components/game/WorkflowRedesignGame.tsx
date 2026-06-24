"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  CAPABILITIES,
  CAPABILITY_BY_KIND,
  IMPL_BY_TIER,
} from "@/lib/workflow-redesign-blocks";
import {
  computeSpeed,
  type CapabilityKind,
  type CheckpointKind,
  type ImplTier,
  type QualityBand,
  type StageBuild,
} from "@/lib/workflow-redesign-scoring";
import { VideoPlaceholder } from "./VideoExplainer";
import { EXPLAINER_SCRIPTS } from "@/lib/game-explainer-scripts";

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
  manualMinutes: number;
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
  volumePerMonth: number;
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

interface StageImpact {
  id: string;
  band: QualityBand;
  manualMinutes: number;
  afterMinutes: number;
}
interface WorkflowImpact {
  beforeMinutes: number;
  afterMinutes: number;
  pctFaster: number;
  volumePerMonth: number;
  hoursSavedPerMonth: number;
  stages: StageImpact[];
  counts: Record<QualityBand, number>;
  overReviewed: number;
  verdict: string;
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
  outcome: string;
  impact: WorkflowImpact;
  explanation: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "setup" | "build";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

/** Placeholder prompts that cycle in the empty ideation input to spark thinking. */
const IDEATION_PROMPTS = [
  "What are the consequences of automating this step…",
  "Give me some ideas about how I can speed up…",
  "Which steps here are judgement calls a human should keep…",
  "Where could an AI go wrong in this workflow…",
];

/** Contextual label for an implementation choice, given the step's capability. */
function implChoiceLabel(tier: ImplTier, cap: CapabilityKind | null): string {
  if (tier === "llm") return "Manually use an LLM";
  if (tier === "custom-app") return "Custom application";
  // rules — phrase it around what the step does
  switch (cap) {
    case "classify":
      return "Rules-based classifier";
    case "extract":
      return "Rules-based extraction";
    case "flag":
      return "Rules-based checks";
    case "summarise":
      return "Templated summary";
    case "draft":
      return "Templated draft";
    default:
      return "Rules-based workflow";
  }
}

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

/** Format a per-item minute figure compactly (e.g. "45 min", "1h 5m"). */
function fmtMins(m: number): string {
  const rounded = Math.round(m);
  if (rounded >= 60) {
    const h = Math.floor(rounded / 60);
    const r = rounded % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  }
  return `${rounded} min`;
}

/** Build the StageBuild[] the scorer/speed helpers expect from the design map. */
function buildsFromDesign(
  stages: { id: string }[],
  design: Record<string, StageDesign>,
): StageBuild[] {
  return stages.map((s) => ({
    stageId: s.id,
    capability: design[s.id]?.capability ?? null,
    impl: design[s.id]?.impl ?? null,
    checkpoint: design[s.id]?.checkpoint ?? false,
  }));
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

  // Ideation chat state.
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [takeaways, setTakeaways] = useState<string[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);

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
      setMessages([]);
      setTakeaways([]);
      setChatModalOpen(false);
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

  // ---- ideation chat (multi-turn, formative & unscored) ----
  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!roundId || !trimmed || chatBusy) return;
      const next = [...messages, { role: "user" as const, content: trimmed }];
      setMessages(next);
      setChatBusy(true);
      try {
        const res = await fetch("/api/games/workflow-redesign/ideate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundId, messages: next }),
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as { reply: string; takeaways: string[] };
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
        if (Array.isArray(data.takeaways) && data.takeaways.length) {
          setTakeaways(data.takeaways);
        }
      } catch {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "I couldn't reach the coach just now — keep going in your own words. Match each bottleneck to the capability that fits it, and keep a human wherever a decision is irreversible or reaches a person.",
          },
        ]);
      } finally {
        setChatBusy(false);
      }
    },
    [roundId, messages, chatBusy],
  );

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
  // "Leave it manual" — clear the capability/impl so the step stays by hand.
  const setManual = useCallback((stageId: string) => {
    setDesign((prev) => ({ ...prev, [stageId]: emptyDesign() }));
  }, []);

  const stages = scenario?.stages ?? [];
  // Every stage with a capability must also have an implementation (a bare
  // capability is half-built), and at least one step must actually be redesigned
  // — so the player can't validate an all-manual "non-redesign".
  const noHalfBuilt =
    stages.length > 0 &&
    stages.every((s) => {
      const d = design[s.id];
      return !d?.capability || Boolean(d.impl);
    });
  const anyRedesigned = stages.some((s) => design[s.id]?.capability);
  const allDecided = noHalfBuilt && anyRedesigned;

  const submit = useCallback(async () => {
    if (!roundId || !scenario) return;
    setSubmitting(true);
    try {
      const builds = buildsFromDesign(scenario.stages, design);
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
    setMessages([]);
    setTakeaways([]);
    setChatModalOpen(false);
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
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
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

              {/* SETUP + IDEATION (side by side) */}
              {phase === "setup" && scenario && (
                <SetupView
                  scenario={scenario}
                  messages={messages}
                  takeaways={takeaways}
                  chatBusy={chatBusy}
                  onSend={sendChat}
                  onNext={() => setPhase("build")}
                />
              )}

              {/* BUILD */}
              {phase === "build" && scenario && (
                <BuildView
                  scenario={scenario}
                  design={design}
                  takeaways={takeaways}
                  setCapability={setCapability}
                  setImpl={setImpl}
                  toggleCheckpoint={toggleCheckpoint}
                  setManual={setManual}
                  allDecided={allDecided}
                  submitting={submitting}
                  onSubmit={submit}
                  onOpenChat={() => setChatModalOpen(true)}
                  loadError={loadError}
                />
              )}
            </div>
          </div>
        )}

        {/* ===== IDEATION CHAT MODAL (re-open from Build) ===== */}
        {chatModalOpen && scenario && (
          <ChatModal
            scenario={scenario}
            messages={messages}
            takeaways={takeaways}
            chatBusy={chatBusy}
            onSend={sendChat}
            onClose={() => setChatModalOpen(false)}
          />
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
  { key: "setup", label: "Explore & ideate" },
  { key: "build", label: "Build & validate" },
];

function PhaseRail({ phase, workflowName }: { phase: Phase; workflowName?: string }) {
  const order = ["setup", "build"];
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

// ===================== setup + ideation (two columns) =====================

/** Read-only summary of the current workflow — the left column of Setup. */
function CurrentWorkflow({ scenario }: { scenario: SafeScenario }) {
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
              fontSize: 15,
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
        <div style={{ fontSize: 15, fontWeight: 700, color: "#13211f" }}>🎯 {scenario.goal}</div>
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
                <div style={{ fontSize: 13.5, color: "#4a615d", marginTop: 4, lineHeight: 1.45 }}>{s.painPoint}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SetupView({
  scenario,
  messages,
  takeaways,
  chatBusy,
  onSend,
  onNext,
}: {
  scenario: SafeScenario;
  messages: ChatMsg[];
  takeaways: string[];
  chatBusy: boolean;
  onSend: (text: string) => void;
  onNext: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* LEFT — read the as-is workflow */}
        <CurrentWorkflow scenario={scenario} />

        {/* RIGHT — think it through with the AI coach */}
        <div
          style={{
            border: "1px solid #cfe5e0",
            borderRadius: 16,
            background: "#f7fbfa",
            padding: "14px 15px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            position: "sticky",
            top: 8,
          }}
        >
          <div>
            <div style={kicker}>think it through · with an AI coach</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "#2c423e", margin: "2px 0 0" }}>
              Chat it out before you rebuild <b>{scenario.workflowName}</b>: where is time lost,
              which steps are judgement calls, where could AI help — and where must a human stay
              accountable? It&apos;s unscored, just to sharpen your thinking.
            </p>
          </div>
          <IdeationChat
            messages={messages}
            takeaways={takeaways}
            chatBusy={chatBusy}
            onSend={onSend}
            minHeight={300}
          />
        </div>
      </div>

      <div>
        <button onClick={onNext} style={primaryBtn}>
          BUILD THE REDESIGN →
        </button>
      </div>
    </div>
  );
}

// ===================== ideation chat =====================

/** Cycle through placeholder prompts every few seconds while the input is empty. */
function useCyclingPlaceholder(active: boolean): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(
      () => setI((n) => (n + 1) % IDEATION_PROMPTS.length),
      3200,
    );
    return () => clearInterval(id);
  }, [active]);
  return IDEATION_PROMPTS[i];
}

function IdeationChat({
  messages,
  takeaways,
  chatBusy,
  onSend,
  minHeight = 260,
}: {
  messages: ChatMsg[];
  takeaways: string[];
  chatBusy: boolean;
  onSend: (text: string) => void;
  minHeight?: number;
}) {
  const [input, setInput] = useState("");
  const placeholder = useCyclingPlaceholder(input.length === 0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, chatBusy]);

  const submit = () => {
    if (!input.trim() || chatBusy) return;
    onSend(input);
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* transcript */}
      <div
        ref={scrollRef}
        style={{
          minHeight,
          maxHeight: 360,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          border: "1px solid #dde9e6",
          borderRadius: 12,
          background: "#fff",
          padding: "12px 13px",
        }}
      >
        {messages.length === 0 && (
          <div style={{ margin: "auto", textAlign: "center", maxWidth: 260 }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>💬</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "#7c9a95" }}>
              Start the conversation — ask anything about how to redesign this
              workflow, and bounce ideas back and forth.
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} content={m.content} />
        ))}
        {chatBusy && (
          <div style={{ alignSelf: "flex-start" }}>
            <div style={{ ...bubbleStyle(false), display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Dots />
            </div>
          </div>
        )}
      </div>

      {/* live takeaways */}
      {takeaways.length > 0 && (
        <TakeawaysBanner takeaways={takeaways} compact />
      )}

      {/* composer */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={2}
          style={{
            flex: 1,
            fontFamily: BODY,
            fontSize: 14,
            lineHeight: 1.5,
            color: "#13211f",
            border: "1.5px solid #cfe5e0",
            borderRadius: 12,
            padding: "10px 12px",
            background: "#fff",
            resize: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={submit}
          disabled={!input.trim() || chatBusy}
          style={{
            ...primaryBtn,
            padding: "11px 16px",
            opacity: !input.trim() || chatBusy ? 0.5 : 1,
            cursor: !input.trim() || chatBusy ? "default" : "pointer",
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "88%" }}>
      <div style={bubbleStyle(isUser)}>{content}</div>
    </div>
  );
}

function bubbleStyle(isUser: boolean): React.CSSProperties {
  return {
    fontSize: 14,
    lineHeight: 1.5,
    borderRadius: 13,
    padding: "9px 12px",
    background: isUser ? ACCENT : "#eef6f4",
    color: isUser ? "#fff" : "#2c423e",
    border: isUser ? "none" : "1px solid #dde9e6",
    whiteSpace: "pre-wrap",
  };
}

/** The distilled "top takeaways" — shown live under the chat and atop the Build. */
function TakeawaysBanner({
  takeaways,
  compact,
  onOpenChat,
}: {
  takeaways: string[];
  compact?: boolean;
  onOpenChat?: () => void;
}) {
  return (
    <div
      style={{
        border: `1.5px solid color-mix(in srgb, ${ACCENT} 32%, #cfe5e0)`,
        background: `color-mix(in srgb, ${ACCENT} 6%, #fffdfb)`,
        borderRadius: 14,
        padding: compact ? "11px 13px" : "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".06em",
            color: ACCENT,
            textTransform: "uppercase",
          }}
        >
          ★ Top takeaways
        </div>
        {onOpenChat && (
          <button onClick={onOpenChat} style={{ ...secondaryBtn, padding: "6px 12px", fontSize: 11.5 }}>
            💬 Revisit / continue chat
          </button>
        )}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        {takeaways.map((t, i) => (
          <li key={i} style={{ fontSize: compact ? 13.5 : 14.5, lineHeight: 1.45, color: "#2c423e" }}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatModal({
  scenario,
  messages,
  takeaways,
  chatBusy,
  onSend,
  onClose,
}: {
  scenario: SafeScenario;
  messages: ChatMsg[];
  takeaways: string[];
  chatBusy: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={overlay()} onClick={onClose}>
      <div style={{ ...modalCard(600) }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={modalKicker}>ideation · {scenario.workflowName}</div>
          <button onClick={onClose} style={{ ...miniBtn, fontSize: 13, color: "#5d7c77" }}>
            ✕ close
          </button>
        </div>
        <IdeationChat
          messages={messages}
          takeaways={takeaways}
          chatBusy={chatBusy}
          onSend={onSend}
          minHeight={320}
        />
      </div>
    </div>
  );
}

// ===================== build canvas =====================

/** A small option button used across the redesign editor. */
function OptionButton({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
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
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/**
 * One redesigned step on the right column — a click-based "Update step" editor
 * (no drag). The player picks what the AI should do at this step (or leaves it
 * manual), how it should run (rules / LLM / custom app — labelled for the chosen
 * capability), and whether a human checkpoints it.
 */
function RedesignStepCard({
  stage,
  index,
  last,
  d,
  setCapability,
  setImpl,
  toggleCheckpoint,
  setManual,
}: {
  stage: Stage;
  index: number;
  last: boolean;
  d: StageDesign;
  setCapability: (stageId: string, cap: CapabilityKind) => void;
  setImpl: (stageId: string, impl: ImplTier) => void;
  toggleCheckpoint: (stageId: string) => void;
  setManual: (stageId: string) => void;
}) {
  const cap = d.capability ? CAPABILITY_BY_KIND[d.capability] : null;
  const redesigned = Boolean(cap);

  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: 26 }}>
        <div style={railNode(redesigned)}>{index + 1}</div>
        {!last && <div style={{ flex: 1, width: 2, background: "#cfe5e0", minHeight: 14 }} />}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          marginBottom: 12,
          border: `1.5px solid ${redesigned ? "color-mix(in srgb, var(--accent) 32%, #cfe5e0)" : "#dde9e6"}`,
          borderRadius: 14,
          padding: "13px 15px",
          background: redesigned ? "color-mix(in srgb, var(--accent) 5%, #fff)" : "#fff",
          transition: "border-color .14s, background .14s",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#13211f" }}>{stage.name}</div>

        <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 11 }}>
          {/* 1 — what should happen here */}
          <div>
            <div style={miniLabel}>update step · what should AI do?</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <OptionButton on={!redesigned} onClick={() => setManual(stage.id)} title="Leave this step to a person">
                ✋ Keep manual
              </OptionButton>
              {CAPABILITIES.map((c) => (
                <OptionButton
                  key={c.kind}
                  on={d.capability === c.kind}
                  onClick={() => setCapability(stage.id, c.kind)}
                  title={c.blurb}
                >
                  {c.glyph} {c.label}
                </OptionButton>
              ))}
            </div>
            {cap && (
              <div style={{ fontSize: 12.5, color: "#5d7c77", marginTop: 6, lineHeight: 1.4 }}>{cap.blurb}</div>
            )}
          </div>

          {/* 2 — how it's built (only once a capability is chosen) */}
          {redesigned && (
            <div>
              <div style={miniLabel}>how should it run?</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["rules", "llm", "custom-app"] as ImplTier[]).map((t) => (
                  <OptionButton
                    key={t}
                    on={d.impl === t}
                    onClick={() => setImpl(stage.id, t)}
                    title={IMPL_BY_TIER[t].blurb}
                  >
                    {implChoiceLabel(t, d.capability)}
                  </OptionButton>
                ))}
              </div>
              {d.impl && (
                <div style={{ fontSize: 12.5, color: "#5d7c77", marginTop: 6, lineHeight: 1.4 }}>
                  {IMPL_BY_TIER[d.impl].blurb}
                </div>
              )}
            </div>
          )}

          {/* 3 — human checkpoint (only meaningful once automated) */}
          {redesigned && (
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
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact read-only current-state stage — the left column of the Build view. */
function CurrentStepCard({ stage, index, last }: { stage: Stage; index: number; last: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: 26 }}>
        <div style={railNode(false)}>{index + 1}</div>
        {!last && <div style={{ flex: 1, width: 2, background: "#cfe5e0", minHeight: 14 }} />}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          marginBottom: 12,
          border: "1px solid #dde9e6",
          borderRadius: 13,
          padding: "12px 14px",
          background: "#fbfdfc",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "#13211f" }}>{stage.name}</div>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: AMBER, whiteSpace: "nowrap" }}>⏱ {stage.timeCost}</span>
        </div>
        <div style={{ fontSize: 13, color: "#4a615d", marginTop: 3, lineHeight: 1.4 }}>{stage.painPoint}</div>
      </div>
    </div>
  );
}

/**
 * Live "estimated cycle time" while the player builds — speed only (it uses just
 * `manualMinutes`, never any ground truth, so it reveals no answers). It makes the
 * speed consequence of each implementation / checkpoint choice felt as they design;
 * the quality read waits for the debrief, where ground truth is allowed.
 */
function LiveSpeedBar({
  scenario,
  design,
}: {
  scenario: SafeScenario;
  design: Record<string, StageDesign>;
}) {
  const builds = buildsFromDesign(scenario.stages, design);
  const { beforeMinutes, afterMinutes, pctFaster } = computeSpeed(
    scenario.stages,
    builds,
  );
  const anyBuilt = builds.some((b) => b.capability);
  const pct = Math.round(pctFaster * 100);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        border: "1px solid #ddefeb",
        borderRadius: 12,
        background: "#fff",
        padding: "10px 14px",
      }}
    >
      <span style={{ ...miniLabel, marginBottom: 0 }}>est. cycle time</span>
      <span style={{ fontFamily: MONO, fontSize: 13, color: "#7c9a95" }}>
        {fmtMins(beforeMinutes)} by hand
      </span>
      <span style={{ fontFamily: MONO, fontSize: 13, color: "#7c9a95" }}>→</span>
      <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: "#13211f" }}>
        {fmtMins(afterMinutes)}
      </span>
      {anyBuilt && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 700,
            color: pct > 0 ? GREEN : AMBER,
            background: pct > 0 ? "#eef7ec" : "#fdf8ee",
            border: `1px solid ${pct > 0 ? "#cfe6d4" : "#efe2c9"}`,
            borderRadius: 999,
            padding: "3px 10px",
          }}
        >
          {pct}% faster
        </span>
      )}
      <span style={{ fontFamily: MONO, fontSize: 11, color: "#9bb4af", marginLeft: "auto" }}>
        per item · checkpoints add review time
      </span>
    </div>
  );
}

function BuildView({
  scenario,
  design,
  takeaways,
  setCapability,
  setImpl,
  toggleCheckpoint,
  setManual,
  allDecided,
  submitting,
  onSubmit,
  onOpenChat,
  loadError,
}: {
  scenario: SafeScenario;
  design: Record<string, StageDesign>;
  takeaways: string[];
  setCapability: (stageId: string, cap: CapabilityKind) => void;
  setImpl: (stageId: string, impl: ImplTier) => void;
  toggleCheckpoint: (stageId: string) => void;
  setManual: (stageId: string) => void;
  allDecided: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onOpenChat: () => void;
  loadError: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* top takeaways carried from ideation + a way back into the chat */}
      {takeaways.length > 0 ? (
        <TakeawaysBanner takeaways={takeaways} onOpenChat={onOpenChat} />
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onOpenChat} style={{ ...secondaryBtn, padding: "8px 14px" }}>
            💬 Open ideation chat
          </button>
        </div>
      )}

      <LiveSpeedBar scenario={scenario} design={design} />

      {/* two columns: current process → redesigned process */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.85fr) minmax(0, 1.15fr)",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div>
          <div style={{ ...kicker, marginBottom: 10 }}>current process · by hand</div>
          {scenario.stages.map((s, i) => (
            <CurrentStepCard key={s.id} stage={s} index={i} last={i === scenario.stages.length - 1} />
          ))}
        </div>
        <div>
          <div style={{ ...kicker, marginBottom: 10 }}>redesigned process · update each step</div>
          {scenario.stages.map((s, i) => (
            <RedesignStepCard
              key={s.id}
              stage={s}
              index={i}
              last={i === scenario.stages.length - 1}
              d={design[s.id] ?? emptyDesign()}
              setCapability={setCapability}
              setImpl={setImpl}
              toggleCheckpoint={toggleCheckpoint}
              setManual={setManual}
            />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button
          onClick={onSubmit}
          disabled={submitting || !allDecided}
          style={{
            ...primaryBtn,
            opacity: submitting || !allDecided ? 0.5 : 1,
            cursor: submitting || !allDecided ? "default" : "pointer",
          }}
        >
          {submitting ? "VALIDATING…" : "VALIDATE DESIGN →"}
        </button>
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#5d7c77" }}>
          {allDecided
            ? "AI will critique it on technical & governance risk"
            : "redesign at least one step, and finish picking how each redesigned step runs"}
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
      <div style={{ ...modalCard(960), padding: "26px 28px", display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap" }}>
        <VideoPlaceholder script={EXPLAINER_SCRIPTS["workflow-redesign"]} accent={ACCENT} />
        <div style={{ flex: "1 1 380px", minWidth: 0 }}>
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
          <li><b>Explore &amp; ideate</b> — read the hand-cranked workflow and chat it through with an AI coach to sharpen your thinking.</li>
          <li><b>Build</b> — go step by step: choose what AI does at each one, how it runs (manual, rules, an LLM or a custom app) and where a human checks.</li>
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

const BAND_META: Record<
  QualityBand,
  { label: string; tone: "good" | "warn" | "bad" }
> = {
  sound: { label: "sound", tone: "good" },
  unaddressed: { label: "still manual", tone: "bad" },
  "under-powered": { label: "error-prone", tone: "bad" },
  "hallucination-exposed": { label: "unguarded AI", tone: "bad" },
  "over-built": { label: "over-built", tone: "warn" },
};

const BAND_ORDER: QualityBand[] = [
  "sound",
  "unaddressed",
  "under-powered",
  "hallucination-exposed",
  "over-built",
];

/**
 * The Consequences panel: what the player's design DID, in plain speed + quality
 * terms. Deterministic numbers (computed server-side) plus the AI run-narration —
 * all feedback only, never part of the score.
 */
function ConsequencesPanel({ result }: { result: ScoreResult }) {
  const { impact } = result;
  const nameById = new Map(result.stages.map((s) => [s.id, s.name]));
  const pct = Math.round(impact.pctFaster * 100);
  const goodSpeed = pct >= 50;

  return (
    <>
      <div style={{ ...kicker, marginTop: 24 }}>
        Consequences · when it went live
      </div>

      {/* speed */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 10 }}>
        {statCard(
          goodSpeed ? "#cfe6d4" : "#efe2c9",
          goodSpeed ? "#eef7ec" : "#fdf8ee",
          goodSpeed ? GREEN : AMBER,
          `${pct}%`,
          "faster per item",
        )}
        {statCard(
          "#cfe5e0",
          "#f2faf8",
          "#13211f",
          `${fmtMins(impact.beforeMinutes)} → ${fmtMins(impact.afterMinutes)}`,
          "cycle time, by hand → redesigned",
        )}
        {statCard(
          "#cfe5e0",
          "#f2faf8",
          "#13211f",
          `${impact.hoursSavedPerMonth}h`,
          `human-hours saved / month · ${impact.volumePerMonth} items`,
        )}
      </div>

      {/* verdict + quality bands */}
      <div
        style={{
          marginTop: 12,
          border: "1px solid #dde9e6",
          borderRadius: 14,
          background: "#f7fbfa",
          padding: "13px 15px",
        }}
      >
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "#13211f" }}>
          {impact.verdict}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {BAND_ORDER.filter((b) => impact.counts[b] > 0).map((b) => {
            const meta = BAND_META[b];
            const names = impact.stages
              .filter((s) => s.band === b)
              .map((s) => nameById.get(s.id))
              .filter(Boolean) as string[];
            return (
              <span
                key={b}
                title={names.join(", ")}
                style={pill(toneColor(meta.tone))}
              >
                {impact.counts[b]} {meta.label}
              </span>
            );
          })}
          {impact.overReviewed > 0 && (
            <span style={pill(AMBER)}>
              {impact.overReviewed} over-reviewed
            </span>
          )}
        </div>
      </div>

      {/* AI run-narration */}
      {result.outcome && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 30%, #cfe5e0)`,
            background: `color-mix(in srgb, ${ACCENT} 5%, #fffdfb)`,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1.2 }}>📟</span>
          <div style={{ fontSize: 14.5, lineHeight: 1.55, color: "#2c423e" }}>
            {result.outcome}
          </div>
        </div>
      )}
    </>
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

      {/* Consequences — deterministic speed + quality read, feedback only */}
      <ConsequencesPanel result={result} />

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
