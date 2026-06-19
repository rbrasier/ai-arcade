"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const ACCENT = "#ec5a3a";
const DISPLAY = "var(--font-bricolage), sans-serif";
const BODY = "var(--font-hanken), system-ui, sans-serif";
const MONO = "var(--font-space-mono), monospace";
const GREEN = "#1f8a5b";

export interface RoundRef {
  id: string;
  difficulty: number;
}

interface SafeCriterion {
  id: string;
  text: string;
}
interface SafeScenario {
  brief: {
    senderName: string;
    senderRole: string;
    senderInitials: string;
    message: string;
  };
  goal: string;
  criteria: SafeCriterion[];
  par: number;
  /** When present, this is a "rewrite" round: a bloated draft to trim down. */
  messyPrompt?: string;
}

interface ScoreResultCriterion {
  id: string;
  text: string;
  met: boolean;
  note: string;
}
interface ScoreResult {
  score: number;
  maxScore: number;
  precision: number;
  economy: number;
  criteriaMet: number;
  criteriaTotal: number;
  words: number;
  par: number;
  criteria: ScoreResultCriterion[];
  feedback: string;
  xpEarned: number;
  bonusXp: number;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Phase = "intro" | "loading" | "brief" | "compose";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function PromptGolfGame({ rounds }: { rounds: RoundRef[] }) {
  const router = useRouter();
  const total = rounds.length || 5;

  const [roundIndex, setRoundIndex] = useState(0);
  const [screen, setScreen] = useState<"play" | "results" | "summary">("play");
  const [phase, setPhase] = useState<Phase>("intro");
  const [scenario, setScenario] = useState<SafeScenario | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [history, setHistory] = useState<
    { score: number; xp: number; precision: number; economy: number }[]
  >([]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
      setPrompt("");
      setLoadError(null);
      try {
        const res = await fetch("/api/games/prompt-golf/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: round.id,
            difficulty: round.difficulty,
          }),
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as {
          roundId: string;
          scenario: SafeScenario;
        };
        setScenario(data.scenario);
        setRoundId(data.roundId);
        // On a rewrite round, seed the editor with the colleague's bloated
        // draft so the player trims it down rather than starting blank.
        setPrompt(data.scenario.messyPrompt ?? "");
        setPhase("brief");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load round");
      }
    },
    [rounds],
  );

  const beginCompose = useCallback(() => {
    setPhase("compose");
  }, []);

  // Focus the prompt box when the composer appears.
  useEffect(() => {
    if (phase === "compose") {
      const t = setTimeout(() => textareaRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const submit = useCallback(async () => {
    if (!roundId || !prompt.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/games/prompt-golf/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, prompt }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as ScoreResult;
      setResult(data);
      setHistory((h) => [
        ...h,
        {
          score: data.score,
          xp: data.xpEarned + data.bonusXp,
          precision: data.precision,
          economy: data.economy,
        },
      ]);
      setScreen("results");
      router.refresh();
    } catch {
      setLoadError("Could not submit — try again.");
    } finally {
      setSubmitting(false);
    }
  }, [roundId, prompt, router]);

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
    setHistory([]);
    setRoundIndex(0);
    setScreen("play");
    setPhase("intro");
    setScenario(null);
    setRoundId(null);
    setResult(null);
    setPrompt("");
  }, []);

  // ---- derived ----
  const words = countWords(prompt);
  const par = scenario?.par ?? 0;
  const overPar = par > 0 && words > par;
  const underBudget = par > 0 ? Math.max(0, par - words) : 0;

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
                  <line x1="20" y1="10" x2="20" y2="50" stroke="#211f1a" strokeWidth="3.4" strokeLinecap="round" />
                  <path d="M20 11 L44 18 L20 26 Z" fill={ACCENT} />
                  <ellipse cx="31" cy="51" rx="15" ry="4.5" stroke="#211f1a" strokeWidth="3" fill="none" />
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
                Prompt Golf
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
              border: "1px solid #ece5d4",
              borderRadius: 22,
              background: "#fffdf7",
              boxShadow: "0 22px 50px -28px rgba(40,34,22,.4)",
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
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.1 }}>
                  Prompt Editor
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "#9a9488", letterSpacing: ".02em" }}>
                  write the leanest prompt that hits the brief
                </div>
              </div>
              {scenario && phase === "compose" && (
                <span style={chipStyle}>PAR {scenario.par}</span>
              )}
            </div>

            {/* body */}
            <div style={{ padding: "24px 22px 22px", minHeight: 420 }}>
              {/* loading */}
              {phase === "loading" && (
                <div
                  style={{
                    margin: "120px auto",
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
                      <div style={{ marginTop: 12 }}>Setting up the hole…</div>
                    </>
                  )}
                </div>
              )}

              {/* compose */}
              {phase === "compose" && scenario && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {/* forwarded brief recap */}
                  <div
                    style={{
                      alignSelf: "flex-start",
                      maxWidth: "94%",
                      display: "flex",
                      gap: 12,
                      animation: "hg-slideUp .4s ease",
                    }}
                  >
                    <div style={{ ...diamondAvatar(34), flex: "none", background: "linear-gradient(135deg,#3a6ea5,#5b91c9)" }}>
                      <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 13, color: "#fff" }}>
                        {scenario.brief.senderInitials}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: "#9a9488", marginBottom: 5 }}>
                        {scenario.brief.senderName} · {scenario.brief.senderRole}
                      </div>
                      <div
                        style={{
                          fontSize: 15.5,
                          lineHeight: 1.5,
                          background: "#faf6ec",
                          border: "1px solid #ece5d4",
                          borderRadius: "5px 16px 16px 16px",
                          padding: "12px 15px",
                          color: "#3a362e",
                        }}
                      >
                        {scenario.brief.message}
                      </div>
                    </div>
                  </div>

                  {/* criteria checklist */}
                  <div
                    style={{
                      border: "1px solid #ece5d4",
                      borderRadius: 16,
                      background: "#faf6ec",
                      padding: "16px 18px",
                    }}
                  >
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "#9a9488", textTransform: "uppercase", marginBottom: 12 }}>
                      Your prompt must make the AI produce a {scenario.goal.toLowerCase()} that:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {scenario.criteria.map((c) => (
                        <div key={c.id} style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.4 }}>
                          <span style={{ flex: "none", width: 20, height: 20, marginTop: 1, borderRadius: 6, border: `1.5px solid ${ACCENT}`, display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT, fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
                            ✓
                          </span>
                          <span style={{ color: "#3a362e" }}>{c.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* rewrite-round banner */}
                  {scenario.messyPrompt && (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        border: "1.5px solid color-mix(in srgb, var(--accent) 38%, #ece5d4)",
                        background: "color-mix(in srgb, var(--accent) 7%, #fffdf7)",
                        borderRadius: 14,
                        padding: "12px 15px",
                      }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1 }}>✂️</span>
                      <div style={{ fontSize: 14.5, lineHeight: 1.45, color: "#3a362e" }}>
                        <b>Rewrite round.</b> A colleague&apos;s long-winded draft is
                        loaded below. Cut it down as far as you can — keep every
                        criterion, lose the filler.
                      </div>
                    </div>
                  )}

                  {/* prompt composer */}
                  <div>
                    <textarea
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Write your prompt — as few words as you can…"
                      rows={4}
                      style={{
                        width: "100%",
                        resize: "vertical",
                        fontFamily: BODY,
                        fontSize: 16,
                        lineHeight: 1.5,
                        color: "#211f1a",
                        background: "#fff",
                        border: `1.5px solid ${overPar ? "#efcabf" : "#e2dcca"}`,
                        borderRadius: 14,
                        padding: "14px 16px",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    {/* word meter */}
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
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 13,
                            fontWeight: 700,
                            color: overPar ? "#c0563a" : GREEN,
                          }}
                        >
                          {words} {words === 1 ? "WORD" : "WORDS"}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: "#9a9488" }}>
                          PAR {par}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: overPar ? "#c0563a" : "#9a9488" }}>
                          {overPar
                            ? `+${words - par} over`
                            : words === 0
                              ? ""
                              : `${underBudget} to spare`}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <button
                          onClick={submit}
                          disabled={submitting || !prompt.trim()}
                          style={{ ...primaryBtn, opacity: submitting || !prompt.trim() ? 0.5 : 1 }}
                        >
                          {submitting ? "SCORING…" : "TAKE THE SHOT →"}
                        </button>
                      </div>
                    </div>
                    {loadError && phase === "compose" && (
                      <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 12, color: "#c0563a" }}>
                        {loadError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* BRIEF MODAL */}
            {phase === "brief" && scenario && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(33,31,26,.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 26,
                  zIndex: 20,
                  animation: "hg-overlayIn .25s ease",
                }}
              >
                <div style={{ maxWidth: 440, width: "100%", background: "#fffdf7", border: "1px solid #ece5d4", borderRadius: 20, boxShadow: "0 30px 60px -24px rgba(33,31,26,.6)", padding: "24px 26px", animation: "hg-modalIn .4s cubic-bezier(.2,.9,.3,1)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#9a9488", textTransform: "uppercase", letterSpacing: ".06em" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, display: "inline-block" }} /> new task · direct message
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 14 }}>
                    <div style={{ width: 46, height: 46, flex: "none", borderRadius: "50%", background: "linear-gradient(135deg,#3a6ea5,#5b91c9)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, color: "#fff" }}>
                      {scenario.brief.senderInitials}
                    </div>
                    <div>
                      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>{scenario.brief.senderName}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: "#9a9488" }}>{scenario.brief.senderRole}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 16, lineHeight: 1.55, marginTop: 16, border: "1px solid #ece5d4", borderRadius: 14, padding: "14px 16px", background: "#faf6ec", color: "#3a362e" }}>
                    {scenario.brief.message}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#9a9488", marginTop: 14, lineHeight: 1.5 }}>
                    Goal: <b style={{ color: "#3a362e" }}>{scenario.goal}</b> · {scenario.criteria.length} criteria · par {scenario.par} words
                    {scenario.messyPrompt ? " · ✂️ rewrite round" : ""}
                  </div>
                  <button onClick={beginCompose} style={{ ...primaryBtn, width: "100%", marginTop: 18, justifyContent: "center" }}>
                    {scenario.messyPrompt ? "OPEN THE DRAFT →" : "OPEN PROMPT EDITOR →"}
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
            promptText={prompt}
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

function Dots({ big }: { big?: boolean }) {
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
    <span style={{ display: "inline-flex", gap: big ? 5 : 4 }}>
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
          Prompt Golf
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#3a362e", marginTop: 10 }}>
          A colleague forwards a real situation. Write the <b>shortest prompt</b> that
          would make an AI produce exactly what they need — hitting <b>every
          criterion</b> on the card without wasting a word. You&apos;re scored on
          <b> precision</b> (did you cover the brief) and <b>word economy</b> (how
          close to or under <b>par</b> you land). You play <b>5 rounds</b>, each one
          tighter than the last.
        </p>

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
                <li>Writing tight, unambiguous prompts that cover every requirement.</li>
                <li>Cutting filler words without dropping intent.</li>
                <li>Trading off brevity against precision under a word budget.</li>
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
  promptText,
  onNext,
}: {
  result: ScoreResult;
  roundNo: number;
  total: number;
  isLast: boolean;
  promptText: string;
  onNext: () => void;
}) {
  const overPar = result.words > result.par;
  const cleared = result.score >= Math.round(result.maxScore * 0.65);
  return (
    <div style={{ border: "1px solid #ece5d4", borderRadius: 22, background: "#fffdf7", boxShadow: "0 22px 50px -28px rgba(40,34,22,.4)", padding: "26px 28px", animation: "hg-slideUp .5s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, letterSpacing: "-0.015em" }}>
          Round {roundNo} — scorecard
        </div>
        <span style={{ ...chipStyle }}>ROUND {roundNo} / {total}</span>
      </div>

      {result.exceptional && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: ".04em",
            color: "#fff",
            background: ACCENT,
            border: "none",
            padding: "8px 14px",
            borderRadius: 999,
            boxShadow: `0 10px 22px -12px ${ACCENT}`,
          }}
        >
          ★ EXCEPTIONAL — every criterion met, under par
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: GREEN, fontWeight: 700 }}>+{result.xpEarned} XP</span>
        {result.bonusXp > 0 && (
          <span style={{ fontFamily: MONO, fontSize: 13, color: "#c9933f", fontWeight: 700 }}>+{result.bonusXp} bonus ★</span>
        )}
        <span style={{ fontFamily: MONO, fontSize: 13, color: "#7c766a" }}>now level {result.player.level} · {result.player.xp} XP</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 18 }}>
        {statCard("#cfe6d4", "#eef7ec", GREEN, `${result.precision}%`, `precision · ${result.criteriaMet}/${result.criteriaTotal} criteria`)}
        {statCard(overPar ? "#efd2c9" : "#cfe6d4", overPar ? "#fdf1ee" : "#eef7ec", overPar ? "#c0563a" : GREEN, `${result.words}/${result.par}`, overPar ? "words · over par" : "words · within par")}
        {statCard("#ece5d4", "#fbf8f0", "#211f1a", `${result.score}`, "round score / 100")}
      </div>

      {/* your prompt */}
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#9a9488", textTransform: "uppercase", marginTop: 24 }}>
        Your prompt
      </div>
      <div style={{ fontSize: 16, lineHeight: 1.55, marginTop: 10, border: "1px solid #ece5d4", borderRadius: 14, padding: "14px 16px", background: "#faf6ec", color: "#211f1a" }}>
        “{promptText}”
      </div>

      {/* criteria breakdown */}
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#9a9488", textTransform: "uppercase", marginTop: 24 }}>
        Criteria coverage
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        {result.criteria.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span
              style={{
                flex: "none",
                width: 22,
                height: 22,
                marginTop: 1,
                borderRadius: 7,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 700,
                background: c.met ? "#b8e6b0" : "#fff",
                border: c.met ? "1px solid #6a9a62" : "1.5px dashed #c0563a",
                color: c.met ? "#2f6e2a" : "#c0563a",
              }}
            >
              {c.met ? "✓" : "✕"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: 1.4, color: "#211f1a" }}>{c.text}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.4, color: "#7c766a", marginTop: 2 }}>{c.note}</div>
            </div>
          </div>
        ))}
      </div>

      {/* verdict */}
      <div style={{ marginTop: 18, borderLeft: `3px solid ${ACCENT}`, padding: "2px 0 2px 13px", color: "#3a362e", fontSize: 15, lineHeight: 1.45 }}>
        {result.feedback}
      </div>

      {!cleared && (
        <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 12, color: "#9a9488" }}>
          Need ≥ 65% to clear — cover every criterion, then trim toward par.
        </div>
      )}

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

/** Up to 3 short, performance-tailored tips for improving on a replay. */
function buildImprovementHints(
  history: { score: number; precision: number; economy: number }[],
): string[] {
  if (history.length === 0) return [];
  const avgPrecision = Math.round(
    history.reduce((n, h) => n + h.precision, 0) / history.length,
  );
  const avgEconomy = Math.round(
    history.reduce((n, h) => n + h.economy, 0) / history.length,
  );
  const overParRounds = history.filter((h) => h.economy < 100).length;
  const missedRounds = history.filter((h) => h.precision < 100).length;

  const hints: string[] = [];
  if (avgPrecision < 100) {
    hints.push(
      `You dropped criteria in ${missedRounds} round${missedRounds === 1 ? "" : "s"} — name every requirement explicitly before trimming. Precision is 70% of your score.`,
    );
  }
  if (avgEconomy < 100) {
    hints.push(
      `You ran over par in ${overParRounds} round${overParRounds === 1 ? "" : "s"} — cut filler ("please can you", "I would like"); a bare imperative is usually enough.`,
    );
  }
  hints.push(
    "Replay to push your score — once every criterion is covered, shave a word at a time and watch the meter.",
  );
  return hints.slice(0, 3);
}

function FinalSummary({
  history,
  total,
  onReplay,
}: {
  history: { score: number; xp: number; precision: number; economy: number }[];
  total: number;
  onReplay: () => void;
}) {
  const avg = history.length ? Math.round(history.reduce((n, h) => n + h.score, 0) / history.length) : 0;
  const totalXp = history.reduce((n, h) => n + h.xp, 0);
  const cleared = history.filter((h) => h.score >= 65).length;
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
        {avg >= 85 ? "Hole in one 🏆" : avg >= 65 ? "Under par 🏌️" : "Keep practising ⛳"}
      </h2>
      <p style={{ fontSize: 15.5, color: "#7c766a", marginTop: 6 }}>
        You cleared <b style={{ color: "#211f1a" }}>{cleared} of {total}</b> rounds.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 20, textAlign: "left" }}>
        {statCard("#ece5d4", "#fbf8f0", "#211f1a", `${avg}`, "average score")}
        {statCard("#cfe6d4", "#eef7ec", GREEN, `${cleared}/${total}`, "rounds cleared (≥65)")}
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
        <p style={{ fontSize: 14.5, color: GREEN, fontWeight: 600, marginTop: 18 }}>
          Sharp work — 90%+ average. Replay to chase a perfect, under-par run.
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
