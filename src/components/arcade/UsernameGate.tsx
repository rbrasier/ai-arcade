"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";

import { UsernameModal } from "./UsernameModal";

interface GateValue {
  /** Whether the current player still needs to choose a username. */
  needsUsername: boolean;
  /**
   * Called when a player picks a game. Returns true if navigation may proceed
   * immediately; returns false (and opens the username modal) when the player
   * must choose a username first — the chosen game is resumed after saving.
   */
  requirePlay: (slug: string) => boolean;
}

const GateContext = createContext<GateValue>({
  needsUsername: false,
  requirePlay: () => true,
});

export function useUsernameGate(): GateValue {
  return useContext(GateContext);
}

/**
 * Wraps the game list so that selecting a game while anonymous opens a
 * "pick a username" modal instead of navigating. Once the username is saved
 * we route on to the game the player originally chose.
 */
export function UsernameGate({
  needsUsername: initialNeedsUsername,
  children,
}: {
  needsUsername: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [needsUsername, setNeedsUsername] = useState(initialNeedsUsername);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const requirePlay = useCallback(
    (slug: string) => {
      if (!needsUsername) return true;
      setPendingSlug(slug);
      return false;
    },
    [needsUsername],
  );

  const handleSaved = useCallback(() => {
    setNeedsUsername(false);
    if (pendingSlug) router.push(`/games/${pendingSlug}`);
    setPendingSlug(null);
  }, [pendingSlug, router]);

  return (
    <GateContext.Provider value={{ needsUsername, requirePlay }}>
      {children}
      {pendingSlug !== null && (
        <UsernameModal
          onClose={() => setPendingSlug(null)}
          onSaved={handleSaved}
        />
      )}
    </GateContext.Provider>
  );
}
