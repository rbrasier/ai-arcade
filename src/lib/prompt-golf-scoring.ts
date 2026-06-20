/**
 * Pure, dependency-free scoring helpers for Prompt Golf.
 *
 * This module deliberately imports nothing from the AI connector or the server
 * runtime so it can be shared by BOTH the scoring route (server) and the game
 * component (client) — the live word meter and the scorecard render the same
 * golf result the server scores against.
 *
 * Scoring model (see docs/GAME-RULES.md):
 *
 *   precision = criteriaMet / criteriaTotal
 *   economy   = economyFor(words, par)   // full marks only near the "ace"
 *   scoreRatio = 0.7 * precision + 0.3 * economy
 *
 * Word economy is anchored on the *ace* — the fewest words we think can still
 * cover every criterion. Landing on par is a solid clear, not a top score:
 * full economy (and so a 100 round) demands approaching the ace, which is meant
 * to feel like a hole-in-one, not just "under par with the criteria met".
 */

export const PRECISION_WEIGHT = 0.7;
export const ECONOMY_WEIGHT = 0.3;

/** Economy credited at exactly par — well short of full marks by design. */
export const PAR_ECONOMY = 0.5;

/** The ace sits at this fraction of par: the theoretical fewest words. */
export const ACE_FRACTION = 0.5;

/**
 * Economy floor for a blown-up word count. Past 2×par economy goes *negative*
 * so a bloated prompt actively drags the score below the precision-only ceiling
 * — pasting a long-winded draft unchanged should fail, not coast on precision.
 * The over-par penalty steepens beyond 2×par ("over double bogey").
 */
export const MIN_ECONOMY = -1.5;

/** The "ace": the fewest words we believe can still cover every criterion. */
export function aceFor(par: number): number {
  return Math.max(2, Math.round(par * ACE_FRACTION));
}

/**
 * Word economy in [MIN_ECONOMY, 1].
 *
 * - at/below the ace → 1 (the tightest possible prompt)
 * - between ace and par → linear from 1 down to PAR_ECONOMY
 * - at par → PAR_ECONOMY
 * - between par and 2×par → linear from PAR_ECONOMY down to 0
 * - beyond 2×par → keeps going *negative* at double the slope (an accelerating
 *   penalty for "over double bogey"), floored at MIN_ECONOMY
 *
 * Going negative is what lets a heavily over-par prompt score below the
 * precision-only ceiling: with 0.3 economy weight, MIN_ECONOMY drops a
 * perfect-precision prompt from 70 down toward 25.
 */
export function economyFor(words: number, par: number): number {
  if (par <= 0) return 1;
  const ace = aceFor(par);
  if (words <= ace) return 1;
  if (words <= par) {
    const span = par - ace;
    if (span <= 0) return 1;
    const t = (words - ace) / span; // 0 at ace → 1 at par
    return 1 - t * (1 - PAR_ECONOMY);
  }
  if (words <= 2 * par) {
    const t = (words - par) / par; // 0 at par → 1 at 2×par
    return PAR_ECONOMY * (1 - t); // PAR_ECONOMY → 0
  }
  // Beyond 2×par: keep descending, but twice as steeply, into negatives.
  const t = (words - 2 * par) / par; // 0 at 2×par, +1 per extra par of bloat
  return Math.max(MIN_ECONOMY, -PAR_ECONOMY * 2 * t);
}

export type GolfTone = "ace" | "great" | "good" | "par" | "over";

export interface GolfResult {
  /** Golf name for this word count, e.g. "Birdie". */
  term: string;
  /** A little icon to sit beside the term. */
  icon: string;
  /** words − par (negative = under par). */
  toPar: number;
  /** Colour band for the scorecard / meter. */
  tone: GolfTone;
}

/**
 * Map a word count to a golf result relative to par and the ace. Because pars
 * are large, each golf term covers a *range* of word counts rather than a
 * single stroke: birdie is the shallow under-par band, eagle/albatross go
 * deeper, and only reaching the ace earns a hole-in-one.
 */
export function golfResult(words: number, par: number): GolfResult {
  const toPar = words - par;
  const ace = aceFor(par);

  if (words <= ace) {
    return { term: "Hole in one", icon: "🏆", toPar, tone: "ace" };
  }
  if (words > par) {
    const over = words - par;
    // More than double par words is a "blow-up" — the same band where economy
    // turns negative and the score collapses.
    if (words > 2 * par) {
      return { term: "Blow-up", icon: "🌪️", toPar, tone: "over" };
    }
    return over > par * 0.25
      ? { term: "Double bogey", icon: "🚩", toPar, tone: "over" }
      : { term: "Bogey", icon: "⚠️", toPar, tone: "over" };
  }
  if (words === par) {
    return { term: "Par", icon: "🎯", toPar, tone: "par" };
  }

  // Strictly between the ace and par: split the span into golf bands.
  const span = par - ace; // > 0 here
  const frac = (par - words) / span; // (0, 1)
  if (frac >= 0.66) return { term: "Albatross", icon: "💎", toPar, tone: "great" };
  if (frac >= 0.33) return { term: "Eagle", icon: "🦅", toPar, tone: "great" };
  return { term: "Birdie", icon: "🐦", toPar, tone: "good" };
}

/** Compute the final score ratio from precision and word count. */
export function scoreRatioFor(precision: number, words: number, par: number): number {
  return PRECISION_WEIGHT * precision + ECONOMY_WEIGHT * economyFor(words, par);
}

/** A perfect round: every criterion met AND the prompt trimmed to the ace. */
export function isExceptional(precision: number, words: number, par: number): boolean {
  return precision === 1 && words <= aceFor(par);
}
