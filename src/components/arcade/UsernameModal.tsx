"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Modal that prompts an anonymous player to choose a unique username before
 * their first game. Saves via `PATCH /api/player`; on success it hands the
 * chosen name back so the gate can resume navigation to the game.
 */
export function UsernameModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (displayName: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape, matching native dialog ergonomics.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (name.length < 2) {
      setError("Pick a username with at least 2 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/player", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Something went wrong — try again.");
        setSaving(false);
        return;
      }

      const data = (await res.json()) as { player: { displayName: string } };
      onSaved(data.player.displayName);
    } catch {
      setError("Network error — try again.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-modal-title"
        className="w-full max-w-[400px] rounded-2xl border border-[#ece5d4] bg-[#fffdf7] p-6 shadow-[0_30px_60px_-30px_rgba(40,34,22,.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-arcade-mono text-[11px] font-bold tracking-[.08em] text-[#ec5a3a]">
          ▶ ONE MORE THING
        </div>
        <h2
          id="username-modal-title"
          className="font-display mt-1.5 text-[24px] font-bold tracking-[-0.01em]"
        >
          Pick your username
        </h2>
        <p className="mt-1.5 text-[14px] leading-[1.45] text-[#7c766a]">
          Choose a unique name to show on the leaderboard. You can change it
          later.
        </p>

        <form onSubmit={handleSubmit} className="mt-4">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            maxLength={40}
            placeholder="e.g. NeonNavigator"
            aria-label="Username"
            aria-invalid={error ? true : undefined}
            className="w-full rounded-[11px] border border-[#e0d9c6] bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-[#ec5a3a]"
          />

          {error && (
            <p className="mt-2 text-[13px] text-[#c0392b]" role="alert">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[9px] px-3.5 py-2 font-arcade-mono text-[12px] font-bold tracking-[.04em] text-[#7c766a] hover:text-[#211f1a]"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-[9px] bg-[#ec5a3a] px-[18px] py-2 font-arcade-mono text-[12px] font-bold tracking-[.05em] text-white disabled:opacity-60"
            >
              {saving ? "SAVING…" : "SAVE & PLAY ▶"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
