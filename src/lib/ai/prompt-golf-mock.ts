import {
  withCriterionIds,
  type PromptGolfEvaluation,
  type PromptGolfScenario,
} from "./prompt-golf";

/**
 * Deterministic offline scenarios — one per difficulty (1-5) — so the game is
 * fully playable with no AI provider configured. The criteria grow in number
 * and subtlety, and par tightens, as difficulty rises. The keyword lists are
 * used only by `mockEvaluatePromptGolf` to grade a prompt offline.
 */
const BANK: Record<number, Parameters<typeof withCriterionIds>[0]> = {
  // D1 — two simple, independent criteria; generous par.
  1: {
    brief: {
      senderName: "Dana Okafor",
      senderRole: "Team Lead",
      senderInitials: "DO",
      message:
        "Can you get the AI to boil any long article down to something I can skim in ten seconds? Just the essentials.",
    },
    goal: "Article summary",
    criteria: [
      {
        text: "Asks for a summary of the article",
        keywords: ["summary", "summarise", "summarize", "sum up", "tldr"],
      },
      {
        text: "Specifies bullet points as the format",
        keywords: ["bullet", "bullets", "dot point", "points", "list"],
      },
    ],
    par: 12,
  },
  // D2 — three criteria incl. a tone constraint.
  2: {
    brief: {
      senderName: "Marcus Lindqvist",
      senderRole: "Head of Comms",
      senderInitials: "ML",
      message:
        "I need replies to customer complaints drafted by AI, but they must sound like us — warm, never defensive — and actually say sorry.",
    },
    goal: "Customer complaint reply",
    criteria: [
      {
        text: "Asks the AI to draft a reply to a customer complaint",
        keywords: ["reply", "respond", "response", "draft", "answer"],
      },
      {
        text: "Requires an apology",
        keywords: ["apolog", "sorry", "apology"],
      },
      {
        text: "Specifies a warm / empathetic tone",
        keywords: ["warm", "empathetic", "empathy", "friendly", "kind", "tone"],
      },
    ],
    par: 16,
  },
  // D3 — the user's example: 3-bullet project status update, problem + next step.
  3: {
    brief: {
      senderName: "Priya Nair",
      senderRole: "Programme Manager",
      senderInitials: "PN",
      message:
        "Give me a way to turn my messy project notes into a status update the steering group will actually read — three bullets, max.",
    },
    goal: "Project status update",
    criteria: [
      {
        text: "Asks for a project status update",
        keywords: ["status", "update", "progress"],
      },
      {
        text: "Specifies exactly three bullet points",
        keywords: ["three", "3", "bullet", "bullets", "dot point", "points"],
      },
      {
        text: "Requires identifying the problem",
        keywords: ["problem", "issue", "blocker", "risk", "challenge"],
      },
      {
        text: "Requires a proposed next step",
        keywords: ["next step", "next steps", "action", "recommend", "propose", "proposed"],
      },
    ],
    par: 22,
  },
  // D4 — four criteria incl. an exclusion (no jargon) and an audience.
  4: {
    brief: {
      senderName: "Tom Becker",
      senderRole: "Finance Manager",
      senderInitials: "TB",
      message:
        "Turn our quarterly numbers into a short note the board can read — plain English, no finance jargon, and call out the single biggest risk.",
    },
    goal: "Board finance note",
    criteria: [
      {
        text: "Asks for a summary of the quarterly financial results",
        keywords: ["summary", "summarise", "summarize", "note", "results", "numbers", "financ"],
      },
      {
        text: "Targets a board / executive audience",
        keywords: ["board", "executive", "exec", "directors", "leadership"],
      },
      {
        text: "Requires plain English with no jargon",
        keywords: ["plain", "no jargon", "jargon-free", "simple", "non-technical", "layman"],
      },
      {
        text: "Requires calling out the biggest risk",
        keywords: ["risk", "biggest risk", "threat", "concern", "exposure"],
      },
    ],
    par: 24,
  },
  // D5 — five interacting constraints; tight par.
  5: {
    brief: {
      senderName: "Aisha Rahman",
      senderRole: "Director of Operations",
      senderInitials: "AR",
      message:
        "I want AI to triage incoming support tickets: tag urgency, route to the right team, and suggest a first reply — as strict JSON so our system can ingest it, nothing else.",
    },
    goal: "Support ticket triage",
    criteria: [
      {
        text: "Asks the AI to triage / classify a support ticket",
        keywords: ["triage", "classify", "categorise", "categorize", "sort", "tag"],
      },
      {
        text: "Requires an urgency / priority label",
        keywords: ["urgency", "priority", "severity", "urgent"],
      },
      {
        text: "Requires routing to the correct team",
        keywords: ["route", "routing", "assign", "team", "department"],
      },
      {
        text: "Requires a suggested first reply",
        keywords: ["reply", "response", "draft", "first reply", "suggested reply"],
      },
      {
        text: "Requires strict JSON output and nothing else",
        keywords: ["json", "strict json", "valid json", "json only", "no prose"],
      },
    ],
    par: 28,
  },
};

export function mockPromptGolfRound(difficulty: number): PromptGolfScenario {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return withCriterionIds(BANK[d]);
}

/**
 * Offline judge: a criterion is "met" if the prompt contains any of its
 * keywords (case-insensitive substring match). Rough but deterministic, so the
 * game scores sensibly with no AI provider configured.
 */
export function mockEvaluatePromptGolf(
  scenario: PromptGolfScenario,
  prompt: string,
): PromptGolfEvaluation {
  const hay = prompt.toLowerCase();
  const criteria = scenario.criteria.map((c) => {
    const met = c.keywords.some((k) => hay.includes(k.toLowerCase()));
    return {
      id: c.id,
      met,
      note: met
        ? "The prompt instructs for this."
        : "The prompt doesn't clearly ask for this.",
    };
  });
  const metCount = criteria.filter((c) => c.met).length;
  const feedback =
    metCount === criteria.length
      ? "Every requirement is covered — now trim any spare words."
      : `Covers ${metCount} of ${criteria.length} requirements; some intent is missing.`;
  return { criteria, feedback };
}
