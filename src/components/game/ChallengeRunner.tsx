"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface RunnerChallenge {
  id: string;
  title: string;
  prompt: string;
  maxScore: number;
  config: Record<string, unknown> | null;
}

interface AttemptResult {
  score: number;
  maxScore: number;
  xpEarned: number;
  bonusXp: number;
  feedback: string;
  exceptional: boolean;
  player: { xp: number; level: number };
}

type Variant = "prompt-golf" | "spot-the-hallucination" | "generic";

export function ChallengeRunner({
  challenges,
  variant = "generic",
}: {
  challenges: RunnerChallenge[];
  variant?: Variant;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const challenge = challenges[index];
  const wordCount = useMemo(
    () => (response.trim() ? response.trim().split(/\s+/).length : 0),
    [response],
  );
  const passage =
    variant === "spot-the-hallucination"
      ? (challenge.config?.passage as string | undefined)
      : undefined;
  const par =
    variant === "prompt-golf"
      ? (challenge.config?.par as number | undefined)
      : undefined;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.id, response }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as AttemptResult;
      setResult(data);
      // Refresh server components (landing-page XP/leaderboard) on next visit.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function nextChallenge() {
    setResult(null);
    setResponse("");
    setError(null);
    setIndex((i) => Math.min(i + 1, challenges.length - 1));
  }

  const isLast = index === challenges.length - 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-2 text-xs">
        {challenges.map((c, i) => (
          <li
            key={c.id}
            className={`rounded-full px-3 py-1 ${
              i === index
                ? "bg-indigo-500 text-white"
                : "bg-black/5 text-black/50 dark:bg-white/10 dark:text-white/50"
            }`}
          >
            {i + 1}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-black/10 bg-white p-6 dark:border-white/15 dark:bg-white/[.03]">
        <p className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
          Challenge {index + 1} of {challenges.length}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{challenge.title}</h2>
        <p className="mt-2 text-black/70 dark:text-white/70">
          {challenge.prompt}
        </p>

        {passage && (
          <blockquote className="mt-4 rounded-lg border-l-4 border-amber-400 bg-amber-400/10 p-4 text-sm italic">
            {passage}
          </blockquote>
        )}

        {!result ? (
          <div className="mt-4 flex flex-col gap-3">
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={variant === "prompt-golf" ? 3 : 5}
              placeholder={
                variant === "spot-the-hallucination"
                  ? "Name the fabricated claim and explain why…"
                  : "Type your answer…"
              }
              className="w-full resize-y rounded-lg border border-black/15 bg-transparent p-3 text-sm outline-none focus:border-indigo-400 dark:border-white/20"
            />
            <div className="flex items-center justify-between text-xs text-black/50 dark:text-white/50">
              <span>
                {wordCount} words
                {par != null && (
                  <>
                    {" "}
                    &middot; par {par}{" "}
                    <span
                      className={
                        wordCount > 0 && wordCount <= par
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      ({wordCount <= par ? "under par" : "over par"})
                    </span>
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || wordCount === 0}
                className="rounded-lg bg-indigo-500 px-4 py-2 font-medium text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Scoring…" : "Submit answer"}
              </button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        ) : (
          <ResultPanel
            result={result}
            isLast={isLast}
            onNext={nextChallenge}
          />
        )}
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  isLast,
  onNext,
}: {
  result: AttemptResult;
  isLast: boolean;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-indigo-400/40 bg-indigo-500/5 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-2xl font-bold">
          {result.score}
          <span className="text-base font-normal text-black/50 dark:text-white/50">
            {" "}
            / {result.maxScore}
          </span>
        </p>
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          +{result.xpEarned} XP
          {result.bonusXp > 0 && (
            <span className="ml-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
              +{result.bonusXp} bonus ★
            </span>
          )}
        </p>
      </div>
      {result.exceptional && (
        <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-400">
          ★ Exceptional answer — bonus reward unlocked!
        </p>
      )}
      <p className="mt-2 text-sm text-black/70 dark:text-white/70">
        {result.feedback}
      </p>
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">
        You&apos;re now level {result.player.level} with {result.player.xp} XP.
      </p>
      {!isLast && (
        <button
          type="button"
          onClick={onNext}
          className="mt-3 rounded-lg border border-indigo-400 px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-500 hover:text-white dark:text-indigo-400"
        >
          Next challenge →
        </button>
      )}
      {isLast && (
        <p className="mt-3 text-sm font-medium text-indigo-600 dark:text-indigo-400">
          That&apos;s the last challenge here — head back to the arcade for more!
        </p>
      )}
    </div>
  );
}
