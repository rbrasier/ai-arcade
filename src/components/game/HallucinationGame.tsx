"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  TIER_INFO,
  tierForDifficulty,
  type ModelTier,
} from "@/lib/hallucination-tiers";

const ACCENT = "#ec5a3a";
const DISPLAY = "var(--font-bricolage), sans-serif";
const BODY = "var(--font-hanken), system-ui, sans-serif";
const MONO = "var(--font-space-mono), monospace";
const GREEN = "#1f8a5b";

/** Badge colours per model tier, matching the AI Foundations course palette. */
const TIER_COLORS: Record<ModelTier, { fg: string; bg: string; border: string }> = {
  quick: { fg: "#0f7a6e", bg: "#e6f5f1", border: "#bfe3da" },
  mid: { fg: "#9a6b14", bg: "#fdf3dd", border: "#ecd9a6" },
  frontier: { fg: ACCENT, bg: "#fdeee9", border: "#f4c9b9" },
};

export interface RoundRef {
  id: string;
  difficulty: number;
}

interface SafeClaim {
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
  attachments: string[];
  promptText: string;
  reasoningSteps: string[];
  claims: SafeClaim[];
}

/** A player's verdict on a single claim. Absent = left unmarked. */
type Verdict = "flag" | "verify";

interface ScoreResultClaim {
  id: string;
  text: string;
  hallucination: boolean;
  flagged: boolean;
  verified: boolean;
  status:
    | "caught"
    | "missed"
    | "vouched"
    | "verified-correct"
    | "false-accusation"
    | "unmarked";
}
interface ScoreResult {
  score: number;
  maxScore: number;
  accuracy: number;
  caught: number;
  totalHallucinations: number;
  missed: number;
  vouched: number;
  verifiedCorrect: number;
  falseAccusations: number;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  claims: ScoreResultClaim[];
  explanations: string[];
  player: { xp: number; level: number };
}

type Phase =
  | "intro"
  | "loading"
  | "modal"
  | "attaching"
  | "typing"
  | "sent"
  | "reasoning"
  | "streaming"
  | "done";

const PHASE_ORDER: Phase[] = [
  "modal",
  "attaching",
  "typing",
  "sent",
  "reasoning",
  "streaming",
  "done",
];

export function HallucinationGame({ rounds }: { rounds: RoundRef[] }) {
  const router = useRouter();
  const total = rounds.length || 5;

  const [roundIndex, setRoundIndex] = useState(0);
  const [screen, setScreen] = useState<"play" | "results" | "summary">("play");
  const [phase, setPhase] = useState<Phase>("intro");
  const [scenario, setScenario] = useState<SafeScenario | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [attachCount, setAttachCount] = useState(0);
  const [typed, setTyped] = useState("");
  const [reasonCount, setReasonCount] = useState(0);
  const [revealedWords, setRevealedWords] = useState(0);
  // Collapsed by default so reading the assistant's reasoning is a deliberate
  // choice (the buried-clue rounds shouldn't hand it over for free). A subtle
  // teaser hints that there's reasoning to examine.
  const [reasonOpen, setReasonOpen] = useState(false);

  // Per-claim verdicts: "flag" (fabricated) / "verify" (sound) / absent (unmarked).
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [history, setHistory] = useState<
    { accuracy: number; xp: number; missed: number; falseAccusations: number }[]
  >([]);

  // ---- round prefetch ----
  // All five rounds are generated in the background — one after another, so each
  // can be told the topics already used and pick a fresh theme — while the
  // player reads the intro modal. Starting and advancing then has little wait.
  type LoadedRound = { roundId: string; scenario: SafeScenario };
  const prefetchRef = useRef<Map<number, Promise<LoadedRound>>>(new Map());
  const usedTopicsRef = useRef<string[]>([]);
  // Bumped on replay to invalidate the cache and warm a fresh, re-themed set.
  const [playToken, setPlayToken] = useState(0);

  const prefetchRound = useCallback(
    (index: number): Promise<LoadedRound> => {
      const cached = prefetchRef.current.get(index);
      if (cached) return cached;
      const round = rounds[index];
      if (!round) return Promise.reject(new Error("No such round"));
      const p = (async () => {
        const res = await fetch("/api/games/hallucination/generate", {
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
      // Drop failed prefetches so a later attempt (retry) can refetch.
      p.catch(() => prefetchRef.current.delete(index));
      prefetchRef.current.set(index, p);
      return p;
    },
    [rounds],
  );

  // Warm every round in the background, sequentially, once per play. Awaiting
  // each before the next lets topic accumulation feed the avoid-list.
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

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  const totalWords = useCallback(
    (sc: SafeScenario) =>
      sc.claims.reduce((n, c) => n + c.text.split(" ").length, 0),
    [],
  );

  // ---- animation sequence (kicked off after the task modal) ----
  const startStreaming = useCallback(
    (sc: SafeScenario) => {
      setPhase("streaming");
      setRevealedWords(0);
      const words = totalWords(sc);
      for (let i = 1; i <= words; i++) {
        schedule(() => setRevealedWords(i), 70 * i);
      }
      schedule(() => setPhase("done"), 70 * words + 500);
    },
    [schedule, totalWords],
  );

  const startReasoning = useCallback(
    (sc: SafeScenario) => {
      setPhase("reasoning");
      setReasonCount(0);
      const n = sc.reasoningSteps.length;
      for (let i = 1; i <= n; i++) {
        schedule(() => setReasonCount(i), 850 * i);
      }
      schedule(() => startStreaming(sc), 850 * n + 650);
    },
    [schedule, startStreaming],
  );

  const startTyping = useCallback(
    (sc: SafeScenario) => {
      setPhase("typing");
      setTyped("");
      const text = sc.promptText;
      for (let i = 1; i <= text.length; i++) {
        schedule(() => setTyped(text.slice(0, i)), 16 * i);
      }
      schedule(() => {
        setPhase("sent");
        schedule(() => startReasoning(sc), 800);
      }, 16 * text.length + 600);
    },
    [schedule, startReasoning],
  );

  const beginTask = useCallback(() => {
    if (!scenario) return;
    clearTimers();
    setPhase("attaching");
    setAttachCount(0);
    const n = scenario.attachments.length;
    for (let i = 1; i <= n; i++) {
      schedule(() => setAttachCount(i), 420 * i);
    }
    schedule(() => startTyping(scenario), 420 * n + 600);
  }, [scenario, clearTimers, schedule, startTyping]);

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
      setVerdicts({});
      setReasonOpen(false);
      setLoadError(null);
      try {
        // Resolves instantly if the background warm-up already finished it.
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

  const skipToDone = useCallback(() => {
    if (!scenario) return;
    clearTimers();
    setAttachCount(scenario.attachments.length);
    setTyped(scenario.promptText);
    setReasonCount(scenario.reasoningSteps.length);
    setRevealedWords(totalWords(scenario));
    setPhase("done");
  }, [scenario, clearTimers, totalWords]);

  // One click flags (fabricated), a second verifies (sound), a third clears it.
  const cycleVerdict = (id: string) =>
    setVerdicts((v) => {
      const next = { ...v };
      if (v[id] === undefined) next[id] = "flag";
      else if (v[id] === "flag") next[id] = "verify";
      else delete next[id];
      return next;
    });

  const submit = useCallback(async () => {
    if (!roundId) return;
    setSubmitting(true);
    try {
      const flaggedClaimIds = Object.keys(verdicts).filter(
        (k) => verdicts[k] === "flag",
      );
      const verifiedClaimIds = Object.keys(verdicts).filter(
        (k) => verdicts[k] === "verify",
      );
      const res = await fetch("/api/games/hallucination/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, flaggedClaimIds, verifiedClaimIds }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ScoreResult;
      setResult(data);
      setHistory((h) => [
        ...h,
        {
          accuracy: data.accuracy,
          xp: data.xpEarned + data.bonusXp,
          missed: data.missed,
          falseAccusations: data.falseAccusations,
        },
      ]);
      setScreen("results");
      router.refresh();
    } catch {
      setLoadError("Could not submit — try again.");
    } finally {
      setSubmitting(false);
    }
  }, [roundId, verdicts, router]);

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
    // Drop the warmed rounds and topics so replay generates a fresh, re-themed set.
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
    setVerdicts({});
  }, [clearTimers]);

  // ---- derived ----
  const at = PHASE_ORDER.indexOf(phase);
  const showUser = at >= PHASE_ORDER.indexOf("sent");
  const showAssistant = at >= PHASE_ORDER.indexOf("reasoning");
  const showResponse = at >= PHASE_ORDER.indexOf("streaming");
  const isDone = phase === "done";
  const thinking = phase === "reasoning";
  const streamingCaret = phase === "streaming";

  // The model tier this round is framed as (quick → mid → frontier).
  const tier = TIER_INFO[tierForDifficulty(rounds[roundIndex]?.difficulty ?? 1)];
  const tierColor = TIER_COLORS[tier.tier];

  const reasonShown =
    phase === "reasoning"
      ? reasonCount
      : at > PHASE_ORDER.indexOf("reasoning")
        ? (scenario?.reasoningSteps.length ?? 0)
        : 0;
  const reasonList = scenario?.reasoningSteps.slice(0, reasonShown) ?? [];
  const reasonHeader =
    isDone || phase === "streaming" ? "Thought for a few seconds" : "Reading the files";

  const composerActive = phase === "attaching" || phase === "typing";
  const composerChips = composerActive
    ? (scenario?.attachments.slice(0, attachCount) ?? [])
    : [];
  const composerText =
    phase === "typing"
      ? typed
      : composerActive
        ? ""
        : "Message Work Assistant…";

  const verdictValues = Object.values(verdicts);
  const flaggedCount = verdictValues.filter((v) => v === "flag").length;
  const verifiedCount = verdictValues.filter((v) => v === "verify").length;
  const markedCount = flaggedCount + verifiedCount;
  const submitLabel =
    markedCount === 0
      ? "NOTHING MARKED"
      : [
          flaggedCount > 0
            ? `${flaggedCount} ${flaggedCount === 1 ? "FLAG" : "FLAGS"}`
            : null,
          verifiedCount > 0 ? `${verifiedCount} VERIFIED` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  // streamed selectable claim spans
  const revealed = !scenario ? 0 : isDone ? totalWords(scenario) : revealedWords;
  const claimSpans: {
    id: string;
    display: string;
    verdict: Verdict | undefined;
  }[] = [];
  if (scenario) {
    let off = 0;
    for (const c of scenario.claims) {
      const words = c.text.split(" ");
      const shown = isDone
        ? words.length
        : Math.max(0, Math.min(words.length, revealed - off));
      off += words.length;
      if (shown > 0) {
        claimSpans.push({
          id: c.id,
          display: words.slice(0, shown).join(" "),
          verdict: verdicts[c.id],
        });
      }
    }
  }

  const showComposer =
    !isDone && (phase === "attaching" || phase === "typing" || phase === "sent" || phase === "reasoning" || phase === "streaming");
  const showSkip = phase !== "modal" && phase !== "loading" && !isDone;

  // ===================== RENDER =====================
  const pageStyle: React.CSSProperties = {
    ["--accent" as string]: ACCENT,
    minHeight: "100vh",
    background:
      "radial-gradient(120% 80% at 80% -10%, #f6f2e7 0%, #efeadd 55%)",
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
            borderBottom: "1px solid #e2dcca",
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
                color: "#7c766a",
                border: "1px solid #e2dcca",
                background: "#fbf8f0",
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
                    "linear-gradient(150deg, color-mix(in srgb, var(--accent) 20%, #fff), #fff)",
                  border: "1px solid color-mix(in srgb, var(--accent) 28%, #efe7d6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 62 62" fill="none">
                  <circle cx="27" cy="27" r="17" stroke="#211f1a" strokeWidth="3.4" />
                  <line x1="39" y1="39" x2="52" y2="52" stroke={ACCENT} strokeWidth="4.4" strokeLinecap="round" />
                  <line x1="20" y1="27" x2="34" y2="27" stroke="#211f1a" strokeWidth="3.4" strokeLinecap="round" />
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
                Spot the Hallucination
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

        {/* ===== GAME (chat) ===== */}
        {screen === "play" && phase !== "intro" && (
          <>
            <div
              style={{
                position: "relative",
                border: "1px solid #ece5d4",
                borderRadius: 22,
                background: "#fffdf7",
                boxShadow: "0 22px 50px -28px rgba(40,34,22,.4)",
                overflow: "hidden",
              }}
            >
              {/* assistant header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "15px 20px",
                  borderBottom: "1px solid #f0e9da",
                  background: "#fbf8f0",
                }}
              >
                <div style={diamondAvatar(38)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="6" y="6" width="12" height="12" rx="2" transform="rotate(45 12 12)" fill={ACCENT} />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
                      Work Assistant
                    </span>
                    <TierBadge tier={tier.tier} />
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: "#9a9488", letterSpacing: ".02em" }}>
                    {tier.modelName} · connected to your workspace files
                  </div>
                </div>
                {showSkip && (
                  <button
                    onClick={skipToDone}
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: ".03em",
                      color: "#9a9488",
                      background: "#fff",
                      border: "1px solid #e7e0cf",
                      padding: "6px 11px",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    SKIP INTRO ⏭
                  </button>
                )}
              </div>

              {/* transcript */}
              <div
                style={{
                  padding: "24px 22px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                  minHeight: 460,
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
                      color: "#9a9488",
                    }}
                  >
                    {loadError ? (
                      <div style={{ color: "#c0563a" }}>
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

                {showUser && scenario && (
                  <>
                    <div
                      style={{
                        alignSelf: "center",
                        fontFamily: MONO,
                        fontSize: 11,
                        color: "#9a9488",
                        letterSpacing: ".02em",
                        background: "#f4efe3",
                        border: "1px solid #e7e0cf",
                        borderRadius: 999,
                        padding: "5px 14px",
                        animation: "hg-popIn .4s ease",
                      }}
                    >
                      ↳ forwarded from {scenario.task.senderName} · {scenario.task.senderRole}
                    </div>
                    <div style={{ alignSelf: "flex-end", maxWidth: "82%", animation: "hg-slideUp .45s ease" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "flex-end", marginBottom: 8 }}>
                        {scenario.attachments.map((a) => (
                          <FileChip key={a} name={a} />
                        ))}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          lineHeight: 1.5,
                          background: "#211f1a",
                          color: "#f4f0e6",
                          borderRadius: "16px 16px 5px 16px",
                          padding: "13px 16px",
                          boxShadow: "0 10px 24px -16px rgba(40,34,22,.6)",
                        }}
                      >
                        {scenario.promptText}
                      </div>
                    </div>
                  </>
                )}

                {showAssistant && scenario && (
                  <div style={{ alignSelf: "flex-start", maxWidth: "94%", display: "flex", gap: 12, animation: "hg-slideUp .45s ease" }}>
                    <div style={{ ...diamondAvatar(34), flex: "none" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <rect x="6" y="6" width="12" height="12" rx="2" transform="rotate(45 12 12)" fill={ACCENT} />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* reasoning panel */}
                      <div style={{ border: "1px solid #ece5d4", borderRadius: 14, background: "#faf6ec", padding: "11px 14px", marginBottom: 13 }}>
                        <div onClick={() => setReasonOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: "#9a9488" }}>{reasonOpen ? "▾" : "▸"}</span>
                          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#7c766a", textTransform: "uppercase" }}>
                            {reasonHeader}
                          </span>
                          {thinking && <Dots inline />}
                        </div>
                        {!reasonOpen && reasonList.length > 0 && (
                          <div
                            onClick={() => setReasonOpen(true)}
                            style={{
                              marginTop: 8,
                              fontSize: 12.5,
                              fontStyle: "italic",
                              color: "#b3ae9f",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {reasonList[0].length > 72
                              ? `${reasonList[0].slice(0, 72).trimEnd()}…`
                              : `${reasonList[0]} …`}
                          </div>
                        )}
                        {reasonOpen && (
                          <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 9 }}>
                            {reasonList.map((r, i) => (
                              <div key={i} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.4, color: "#6a655b", animation: "hg-popIn .35s ease" }}>
                                <span style={{ flex: "none", width: 6, height: 6, marginTop: 6, borderRadius: "50%", background: "#cfc7b3" }} />
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* waiting dots */}
                      {phase === "reasoning" && (
                        <div style={{ display: "inline-flex", gap: 5, padding: "8px 4px" }}>
                          <Dots big />
                        </div>
                      )}

                      {/* streamed answer */}
                      {showResponse && (
                        <div style={{ fontSize: 20, lineHeight: 2.0, color: "#211f1a" }}>
                          {claimSpans.map((c) => {
                            const bg =
                              c.verdict === "flag"
                                ? ACCENT
                                : c.verdict === "verify"
                                  ? GREEN
                                  : "transparent";
                            const marked = c.verdict !== undefined;
                            return (
                              <span
                                key={c.id}
                                onClick={isDone ? () => cycleVerdict(c.id) : undefined}
                                title={
                                  isDone
                                    ? "Click: flag as fabricated → verify as sound → clear"
                                    : undefined
                                }
                                style={
                                  isDone
                                    ? {
                                        cursor: "pointer",
                                        borderRadius: 5,
                                        padding: "2px 3px",
                                        transition: "background .14s, box-shadow .14s",
                                        background: bg,
                                        color: marked ? "#fff" : "#211f1a",
                                        boxShadow: marked ? `0 2px 0 ${bg}` : "none",
                                      }
                                    : { padding: "2px 1px" }
                                }
                              >
                                {c.verdict === "flag" && "🚩 "}
                                {c.verdict === "verify" && "✓ "}
                                {c.display}{" "}
                              </span>
                            );
                          })}
                          {streamingCaret && (
                            <span style={{ display: "inline-block", width: 9, height: 21, background: "#211f1a", verticalAlign: -4, animation: "hg-blink 1s steps(1) infinite" }} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* YOUR TURN handoff */}
                {isDone && (
                  <div
                    style={{
                      animation: "hg-slideUp .5s ease",
                      border: "1.5px solid color-mix(in srgb, var(--accent) 38%, #ece5d4)",
                      background: "color-mix(in srgb, var(--accent) 7%, #fffdf7)",
                      borderRadius: 16,
                      padding: "18px 20px",
                      marginTop: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          flex: "none",
                          borderRadius: 10,
                          background: ACCENT,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          animation: "hg-pulseRing 2s ease-out infinite",
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M5 19 L14 6 l4 3 L9 22 L4 22 Z" fill="#fff" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 21, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
                          Your turn — judge each claim.
                        </div>
                        <div style={{ fontSize: 14.5, color: "#7c766a", lineHeight: 1.4, marginTop: 4 }}>
                          Tap a claim to cycle it: <b style={{ color: ACCENT }}>🚩 flag</b> what looks
                          fabricated, <b style={{ color: GREEN }}>✓ verify</b> what you&apos;ve
                          checked against the files, or leave it unmarked. This is the{" "}
                          <b style={{ color: "#211f1a" }}>{tier.label.toLowerCase()} model</b> — {tier.note}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
                      <button onClick={submit} disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? 0.6 : 1 }}>
                        {submitting ? "SCORING…" : `SUBMIT ${submitLabel} →`}
                      </button>
                      <button
                        onClick={() => setVerdicts({})}
                        style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#7c766a", background: "#fff", border: "1px solid #e2dcca", padding: "11px 16px", borderRadius: 11, cursor: "pointer" }}
                      >
                        CLEAR
                      </button>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#9a9488" }}>missing a fabrication costs you — so do false flags</div>
                    </div>
                  </div>
                )}
              </div>

              {/* composer */}
              {showComposer && (
                <div style={{ borderTop: "1px solid #f0e9da", padding: "14px 16px", background: "#fbf8f0" }}>
                  {composerChips.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
                      {composerChips.map((a) => (
                        <FileChip key={a} name={a} check />
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 36, height: 36, flex: "none", border: "1px solid #e2dcca", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M19 11 l-7.5 7.5 a3.5 3.5 0 0 1 -5 -5 L13 6 a2.4 2.4 0 0 1 3.4 3.4 l-7 7 a1.2 1.2 0 0 1 -1.7 -1.7 L13 10" stroke="#9a9488" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minHeight: 40, border: "1px solid #e2dcca", borderRadius: 11, background: "#fff", padding: "9px 13px", fontSize: 15, display: "flex", alignItems: "center", color: phase === "typing" && typed ? "#211f1a" : "#b3ae9f" }}>
                      <span>{composerText}</span>
                      {phase === "typing" && (
                        <span style={{ display: "inline-block", width: 8, height: 18, background: "#211f1a", marginLeft: 1, animation: "hg-blink 1s steps(1) infinite" }} />
                      )}
                    </div>
                    <div style={{ width: 40, height: 40, flex: "none", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: ACCENT }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <line x1="12" y1="19" x2="12" y2="6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
                        <path d="M6 12 L12 5 L18 12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* TASK MODAL */}
              {phase === "modal" && scenario && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(33,31,26,.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 26,
                    zIndex: 50,
                    overflowY: "auto",
                    animation: "hg-overlayIn .25s ease",
                  }}
                >
                  <div style={{ maxWidth: 440, width: "100%", background: "#fffdf7", border: "1px solid #ece5d4", borderRadius: 20, boxShadow: "0 30px 60px -24px rgba(33,31,26,.6)", padding: "24px 26px", animation: "hg-modalIn .4s cubic-bezier(.2,.9,.3,1)", maxHeight: "86vh", overflowY: "auto" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#9a9488", textTransform: "uppercase", letterSpacing: ".06em" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, display: "inline-block" }} /> new task · direct message
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
                      <div style={{ width: 46, height: 46, flex: "none", borderRadius: "50%", background: "linear-gradient(135deg,#3a6ea5,#5b91c9)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, color: "#fff" }}>
                        {scenario.task.senderInitials}
                      </div>
                      <div>
                        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>{scenario.task.senderName}</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: "#9a9488" }}>{scenario.task.senderRole}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 16, lineHeight: 1.55, marginTop: 16, border: "1px solid #ece5d4", borderRadius: 14, padding: "14px 16px", background: "#faf6ec", color: "#3a362e" }}>
                      {scenario.task.message}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        marginTop: 14,
                        border: `1px solid ${tierColor.border}`,
                        background: tierColor.bg,
                        borderRadius: 12,
                        padding: "11px 13px",
                      }}
                    >
                      <TierBadge tier={tier.tier} />
                      <div style={{ fontSize: 12.5, lineHeight: 1.4, color: "#5a554c" }}>
                        Answered by <b style={{ color: tierColor.fg }}>{tier.modelName}</b>. {tier.note}
                      </div>
                    </div>
                    <button onClick={beginTask} style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}>
                      OPEN IN WORK ASSISTANT →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* hint strip */}
            {isDone && (
              <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 12, color: "#9a9488", marginTop: 14, animation: "hg-popIn .5s ease .15s both" }}>
                🚩 {flaggedCount} flagged · ✓ {verifiedCount} verified · click a claim to cycle
              </div>
            )}
          </>
        )}

        {/* ===== DEBRIEF ===== */}
        {screen === "results" && result && (
          <Debrief
            result={result}
            roundNo={roundIndex + 1}
            total={total}
            isLast={roundIndex + 1 >= total}
            tier={tier.tier}
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
  color: "#7c766a",
  background: "#fbf8f0",
  border: "1px solid #e2dcca",
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

function TierBadge({ tier, big }: { tier: ModelTier; big?: boolean }) {
  const c = TIER_COLORS[tier];
  const info = TIER_INFO[tier];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: MONO,
        fontSize: big ? 12 : 10.5,
        fontWeight: 700,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.border}`,
        padding: big ? "5px 11px" : "3px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.fg }} />
      {info.label} model
    </span>
  );
}

function diamondAvatar(size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    background: "#211f1a",
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
    background: big ? "#cfc7b3" : ACCENT,
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

function FileChip({ name, check }: { name: string; check?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        fontFamily: MONO,
        fontSize: 11.5,
        color: "#6a655b",
        border: "1px solid #e2dcca",
        borderRadius: 9,
        background: check ? "#fff" : "#fbf8f0",
        padding: "5px 10px",
        animation: "hg-popIn .3s ease",
      }}
    >
      <svg width="12" height="14" viewBox="0 0 18 22" fill="none">
        <path d="M3 2 h8 l4 4 v14 H3 z" stroke="#9a9488" strokeWidth="2" fill="#fff" />
        <path d="M11 2 v4 h4" stroke="#9a9488" strokeWidth="2" fill="none" />
      </svg>
      {name} {check && <span style={{ color: "#1f8a5b" }}>✓</span>}
    </div>
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
        background: "rgba(33,31,26,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 26,
        zIndex: 50,
        animation: "hg-overlayIn .25s ease",
      }}
    >
      <div style={{ maxWidth: 520, width: "100%", background: "#fffdf7", border: "1px solid #ece5d4", borderRadius: 20, boxShadow: "0 30px 60px -24px rgba(33,31,26,.6)", padding: "26px 28px", animation: "hg-modalIn .4s cubic-bezier(.2,.9,.3,1)", maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#9a9488", textTransform: "uppercase", letterSpacing: ".06em" }}>
          how to play
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: "-0.015em", margin: "8px 0 0" }}>
          Spot the Hallucination
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#3a362e", marginTop: 10 }}>
          A work assistant answers a colleague&apos;s task using your files. Read its
          answer, then judge each claim. Across the <b>5 rounds</b> the answers come from
          progressively stronger models — a quick <b>Small</b> model up to a{" "}
          <b>Frontier</b> model — and the stronger the model, the <b>rarer</b> the
          mistakes. Catch the fabrications <i>without</i> distrusting the sound claims.
        </p>

        {/* model-tier ladder */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <TierBadge tier="quick" big />
          <span style={{ alignSelf: "center", color: "#b3ae9f" }}>→</span>
          <TierBadge tier="mid" big />
          <span style={{ alignSelf: "center", color: "#b3ae9f" }}>→</span>
          <TierBadge tier="frontier" big />
          <span style={{ alignSelf: "center", fontFamily: MONO, fontSize: 11, color: "#9a9488" }}>
            fewer fabrications →
          </span>
        </div>

        {/* standout badge: there are clues */}
        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            marginTop: 16,
            border: `1.5px solid color-mix(in srgb, ${ACCENT} 42%, #ece5d4)`,
            background: `color-mix(in srgb, ${ACCENT} 8%, #fffdf7)`,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>🔍</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#3a362e" }}>
            <b style={{ color: ACCENT }}>There are clues in every task.</b> A fabrication
            always gives itself away — a wrong name, an invented number, a citation to a
            file you were never given, or a line that clashes with the assistant&apos;s own
            reasoning. Open the reasoning panel and check against the attachments to pin it
            down.
          </div>
        </div>

        {/* standout badge: how to flag / verify */}
        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "flex-start",
            marginTop: 10,
            border: `1.5px solid ${TIER_COLORS.quick.border}`,
            background: TIER_COLORS.quick.bg,
            borderRadius: 14,
            padding: "13px 15px",
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1.1 }}>👆</span>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: "#3a362e" }}>
            <b>How to answer.</b> Click a claim once to <b style={{ color: ACCENT }}>🚩 flag</b> it
            as fabricated, again to <b style={{ color: GREEN }}>✓ verify</b> it as sound, a
            third time to clear it. Leaving a sound claim unmarked is safe — but{" "}
            <b>letting a fabrication slip by costs you</b>, and so does a false flag.
          </div>
        </div>

        <div style={{ marginTop: 16, border: "1px solid #ece5d4", borderRadius: 12, background: "#faf6ec", overflow: "hidden" }}>
          <div
            onClick={() => setRulesOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "12px 14px" }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#9a9488" }}>{rulesOpen ? "▾" : "▸"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".03em", color: "#7c766a", textTransform: "uppercase" }}>
              Learning outcomes &amp; common rules
            </span>
          </div>
          {rulesOpen && (
            <div style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.5, color: "#3a362e" }}>
              <p style={{ marginTop: 0, fontWeight: 600 }}>You&apos;ll practise:</p>
              <ul style={{ margin: "4px 0 12px", paddingLeft: 18 }}>
                <li>Detecting fabricated claims, bad statistics and fake citations.</li>
                <li>Catching misspelled names and clues hidden in AI reasoning.</li>
                <li>Calibrating trust to the model — verifying the claims that matter without distrusting sound ones.</li>
              </ul>
              <p style={{ marginTop: 0, fontWeight: 600 }}>Common arcade rules:</p>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                <li>Clear a round at <b>≥ 65%</b> accuracy to unlock the next level.</li>
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
      <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#6a655b", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Debrief({
  result,
  roundNo,
  total,
  isLast,
  tier,
  onNext,
}: {
  result: ScoreResult;
  roundNo: number;
  total: number;
  isLast: boolean;
  tier: ModelTier;
  onNext: () => void;
}) {
  const wrongCalls = result.falseAccusations + result.vouched;
  return (
    <div style={{ border: "1px solid #ece5d4", borderRadius: 22, background: "#fffdf7", boxShadow: "0 22px 50px -28px rgba(40,34,22,.4)", padding: "26px 28px", animation: "hg-slideUp .5s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, letterSpacing: "-0.015em" }}>
            Round {roundNo} — debrief
          </div>
          <TierBadge tier={tier} />
        </div>
        <span style={{ ...chipStyle }}>ROUND {roundNo} / {total}</span>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: "#1f8a5b", fontWeight: 700 }}>+{result.xpEarned} XP</span>
        {result.bonusXp > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, color: "#c9933f", fontWeight: 700 }}>+{result.bonusXp} bonus ★</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 13, color: "#7c766a" }}>now level {result.player.level} · {result.player.xp} XP</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 18 }}>
        {result.totalHallucinations > 0
          ? statCard("#cfe6d4", "#eef7ec", "#1f8a5b", `${result.caught}/${result.totalHallucinations}`, "fabrications caught")
          : statCard("#cfe6d4", "#eef7ec", "#1f8a5b", String(result.verifiedCorrect), "clean round — claims verified")}
        {statCard("#efd2c9", "#fdf1ee", "#c0563a", String(wrongCalls), wrongCalls === 1 ? "wrong call (false flag / vouch)" : "wrong calls (false flags / vouches)")}
        {statCard("#ece5d4", "#fbf8f0", "#211f1a", `${result.accuracy}%`, "accuracy this round")}
      </div>

      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#9a9488", textTransform: "uppercase", marginTop: 24 }}>
        True vs. fabricated
      </div>
      <div style={{ fontSize: 18, lineHeight: 1.95, marginTop: 10, border: "1px solid #ece5d4", borderRadius: 14, padding: "18px 20px", background: "#faf6ec" }}>
        {result.claims.map((c) => {
          let style: React.CSSProperties = { padding: "2px 1px" };
          if (c.status === "caught") style = { background: "#b8e6b0", borderRadius: 4, padding: "2px 3px" };
          else if (c.status === "verified-correct") style = { background: "#cfe0f7", borderRadius: 4, padding: "2px 3px" };
          else if (c.status === "missed") style = { background: "#fff", border: "1.5px dashed #c0563a", borderRadius: 4, padding: "1px 3px" };
          else if (c.status === "vouched") style = { background: "#ef9d88", borderRadius: 4, padding: "2px 3px", textDecoration: "underline wavy #8c2f1a" };
          else if (c.status === "false-accusation") style = { background: "#f3cfa9", borderRadius: 4, padding: "2px 3px" };
          return (
            <span key={c.id} style={style}>
              {c.text}{" "}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, fontFamily: MONO, fontSize: 12, color: "#7c766a" }}>
        <LegendSwatch bg="#b8e6b0" border="#6a9a62" label="caught fabrication" />
        <LegendSwatch bg="#cfe0f7" border="#7da7d9" label="verified sound" />
        <LegendSwatch bg="#fff" border="#c0563a" dashed label="missed" />
        <LegendSwatch bg="#ef9d88" border="#8c2f1a" label="vouched for a lie" />
        <LegendSwatch bg="#f3cfa9" border="#c9933f" label="false accusation" />
      </div>

      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#9a9488", textTransform: "uppercase", marginTop: 24 }}>
        Why
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10, fontSize: 15, lineHeight: 1.45 }}>
        {result.explanations.map((e, i) => (
          <div key={i} style={{ borderLeft: "3px solid #c0563a", padding: "2px 0 2px 13px", color: "#3a362e" }}>{e}</div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 26, flexWrap: "wrap" }}>
        <button onClick={onNext} style={{ ...primaryBtn, padding: "13px 24px" }}>
          {isLast ? "SEE SUMMARY →" : "NEXT ROUND →"}
        </button>
        <Link href="/" style={{ textDecoration: "none", fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".04em", color: "#7c766a", background: "#fbf8f0", border: "1px solid #e2dcca", padding: "13px 20px", borderRadius: 12 }}>
          BACK TO ARCADE
        </Link>
      </div>
    </div>
  );
}

function LegendSwatch({ bg, border, label, dashed }: { bg: string; border: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 14, height: 14, background: bg, border: `${dashed ? "1.5px dashed" : "1px solid"} ${border}`, borderRadius: 3, display: "inline-block" }} />
      {label}
    </span>
  );
}

/** Up to 3 short, performance-tailored tips for improving on a replay. */
function buildImprovementHints(
  history: { accuracy: number; missed: number; falseAccusations: number }[],
): string[] {
  if (history.length === 0) return [];
  const totalMissed = history.reduce((n, h) => n + h.missed, 0);
  const totalFalse = history.reduce((n, h) => n + h.falseAccusations, 0);

  const hints: string[] = [];
  if (totalMissed > 0) {
    hints.push(
      `You let ${totalMissed} fabrication${totalMissed === 1 ? "" : "s"} through — check every name, statistic and citation against the source files before trusting it.`,
    );
  }
  if (totalFalse > 0) {
    hints.push(
      `You flagged ${totalFalse} sound claim${totalFalse === 1 ? "" : "s"} — a false flag scores zero. Once you've checked a claim against the files, verify it instead.`,
    );
  }
  hints.push(
    "Frontier rounds rarely fabricate — verify what checks out and resist over-flagging. Open the reasoning panel too: the later rounds bury the clue in the assistant's thinking.",
  );
  return hints.slice(0, 3);
}

function FinalSummary({ history, total, onReplay }: { history: { accuracy: number; xp: number; missed: number; falseAccusations: number }[]; total: number; onReplay: () => void }) {
  const avg = history.length ? Math.round(history.reduce((n, h) => n + h.accuracy, 0) / history.length) : 0;
  const totalXp = history.reduce((n, h) => n + h.xp, 0);
  const cleared = history.filter((h) => h.accuracy >= 65).length;
  // Offer improvement feedback on any run that wasn't near-perfect (< 90%).
  const hints = avg < 90 ? buildImprovementHints(history) : [];

  return (
    <div
      style={{
        ["--accent" as string]: ACCENT,
        position: "fixed",
        inset: 0,
        background: "rgba(33,31,26,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 26,
        zIndex: 50,
        animation: "hg-overlayIn .25s ease",
      }}
    >
      <div style={{ maxWidth: 540, width: "100%", background: "#fffdf7", border: "1px solid #ece5d4", borderRadius: 20, boxShadow: "0 30px 60px -24px rgba(33,31,26,.6)", padding: "30px 28px", animation: "hg-modalIn .4s cubic-bezier(.2,.9,.3,1)", maxHeight: "88vh", overflowY: "auto", textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#9a9488", textTransform: "uppercase" }}>
        game complete
      </div>
      <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", margin: "8px 0 0" }}>
        {avg >= 85 ? "Signal Reader 🏆" : avg >= 65 ? "Sharp eye 👀" : "Keep training 🔍"}
      </h2>
      <p style={{ fontSize: 15.5, color: "#7c766a", marginTop: 6 }}>
        You cleared <b style={{ color: "#211f1a" }}>{cleared} of {total}</b> rounds.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 20, textAlign: "left" }}>
        {statCard("#ece5d4", "#fbf8f0", "#211f1a", `${avg}%`, "average accuracy")}
        {statCard("#cfe6d4", "#eef7ec", "#1f8a5b", `${cleared}/${total}`, "rounds cleared (≥65%)")}
        {statCard("#efe2c9", "#fdf8ee", "#c9933f", `+${totalXp}`, "XP earned")}
      </div>

      {hints.length > 0 ? (
        <div style={{ marginTop: 22, border: "1.5px solid color-mix(in srgb, var(--accent) 32%, #ece5d4)", background: "color-mix(in srgb, var(--accent) 6%, #fffdf7)", borderRadius: 16, padding: "16px 18px", textAlign: "left" }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: ACCENT, textTransform: "uppercase", marginBottom: 10 }}>
            How to improve
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            {hints.map((h, i) => (
              <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, color: "#3a362e" }}>{h}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ fontSize: 14.5, color: "#1f8a5b", fontWeight: 600, marginTop: 18 }}>
          Sharp eye — 90%+ accuracy. Replay for a perfect run.
        </p>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={onReplay} style={primaryBtn}>↻ PLAY AGAIN</button>
        <Link href="/" style={{ textDecoration: "none", fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".04em", color: "#7c766a", background: "#fbf8f0", border: "1px solid #e2dcca", padding: "12px 20px", borderRadius: 12 }}>
          BACK TO ARCADE
        </Link>
      </div>
      </div>
    </div>
  );
}
