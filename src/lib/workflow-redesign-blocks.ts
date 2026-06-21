/**
 * Display metadata for the "Workflow Redesign Challenge" palette — the AI
 * capability blocks the player drags onto each workflow stage, and the
 * implementation tiers each block can run as.
 *
 * Pure and dependency-free (string/JSX-free) so the client component, the
 * generator prompt and the debrief can all share one source of truth for the
 * labels. The grading lives in workflow-redesign-scoring.ts; this is only copy.
 */

import type { CapabilityKind, ImplTier } from "./workflow-redesign-scoring";

export interface CapabilityInfo {
  kind: CapabilityKind;
  /** Short label shown on the draggable block. */
  label: string;
  /** A glyph for the block (kept as plain text so this file stays JSX-free). */
  glyph: string;
  /** One line describing what the block does to a stage. */
  blurb: string;
}

export const CAPABILITIES: CapabilityInfo[] = [
  {
    kind: "summarise",
    label: "Summarise",
    glyph: "≡",
    blurb: "Condense long inputs into the key points a human or next step needs.",
  },
  {
    kind: "classify",
    label: "Classify",
    glyph: "⊞",
    blurb: "Sort or route an item into categories (approve / reject, type, priority).",
  },
  {
    kind: "extract",
    label: "Extract",
    glyph: "⌖",
    blurb: "Pull specific fields or figures out of messy documents into structured data.",
  },
  {
    kind: "flag",
    label: "Flag",
    glyph: "⚑",
    blurb: "Surface anomalies, risks or exceptions for a human to look at.",
  },
  {
    kind: "draft",
    label: "Draft",
    glyph: "✎",
    blurb: "Generate a first-pass document, reply or plan for review.",
  },
];

export const CAPABILITY_BY_KIND: Record<CapabilityKind, CapabilityInfo> =
  Object.fromEntries(CAPABILITIES.map((c) => [c.kind, c])) as Record<
    CapabilityKind,
    CapabilityInfo
  >;

export interface ImplInfo {
  tier: ImplTier;
  label: string;
  /** Short trade-off line shown in the implementation drill-down. */
  blurb: string;
}

export const IMPL_TIERS: ImplInfo[] = [
  {
    tier: "rules",
    label: "Rules-based filter",
    blurb: "Fast, cheap, fully predictable — but brittle and blind to nuance.",
  },
  {
    tier: "llm",
    label: "LLM",
    blurb: "Handles nuance and language well — but can hallucinate, so needs oversight.",
  },
  {
    tier: "custom-app",
    label: "Custom application",
    blurb:
      "IT-built and tailored: highest capability and speed, worth it only when the volume or stakes justify the build.",
  },
];

export const IMPL_BY_TIER: Record<ImplTier, ImplInfo> = Object.fromEntries(
  IMPL_TIERS.map((t) => [t.tier, t]),
) as Record<ImplTier, ImplInfo>;
