import {
  withItemIds,
  type ContextCalibrationScenario,
  type RawContextCalibrationScenario,
} from "./context-calibration";

/**
 * Deterministic offline scenarios — one per difficulty (1-5) — so "Context
 * Calibration" is fully playable with no AI provider configured. Distractor
 * pressure rises with difficulty (none on round 1, several tempting ones by
 * round 5), mirroring the live generator: the player practises adding the
 * snippets the answer needs while resisting the urge to attach everything.
 *
 * Snippets are shuffled (essentials are NOT always first) so position carries no
 * signal — the player has to read each one.
 */
const BANK: Record<number, RawContextCalibrationScenario> = {
  // D1 — one essential among obvious office noise; no distractor.
  1: {
    topic: "refund reply",
    task: {
      senderName: "Hannah Cole",
      senderRole: "Support Lead",
      senderInitials: "HC",
      message:
        "Can you draft a short, warm reply to a customer asking for a refund on their order? Attach whatever context the answer actually needs.",
    },
    goal: "Draft a 2-3 sentence reply to the customer about their refund.",
    items: [
      {
        text: "The office coffee machine is being serviced on Friday.",
        kind: "noise",
        reason: "An internal facilities note — nothing to do with this customer's refund.",
      },
      {
        text: "Our policy gives a full refund within 30 days of purchase; this order was placed 12 days ago.",
        kind: "essential",
        reason: "This is the fact that decides the reply: 12 days is inside the 30-day window, so they qualify.",
      },
      {
        text: "Marketing is launching a summer campaign next month.",
        kind: "noise",
        reason: "A marketing update with no bearing on a refund decision.",
      },
      {
        text: "Our support Slack channel was renamed last week.",
        kind: "noise",
        reason: "An internal tooling change — irrelevant to the customer-facing reply.",
      },
    ],
    explanation:
      "Only the refund-window snippet mattered: 30-day policy, order placed 12 days ago, so the customer clearly qualifies. The other three were office noise that would only clutter the reply without changing it.",
  },

  // D2 — one essential, one gentle distractor (a stale time), two noise.
  2: {
    topic: "meeting time",
    task: {
      senderName: "Sofia Marchetti",
      senderRole: "Team Coordinator",
      senderInitials: "SM",
      message:
        "Find a 30-minute slot to call our New York client this Thursday and suggest a time.",
    },
    goal: "Suggest a Thursday meeting time that works for the New York client.",
    items: [
      {
        text: "The quarterly report is due next Tuesday.",
        kind: "noise",
        reason: "A deadline for unrelated work — it doesn't constrain the call time.",
      },
      {
        text: "The client is in New York (Eastern Time) and is free 9am-12pm their time on Thursday.",
        kind: "essential",
        reason: "The one fact you need — it pins the time zone and the window the time must fall in.",
      },
      {
        text: "Last week's catch-up with them happened at 3pm London time.",
        kind: "distractor",
        reason: "Tempting to just reuse it, but it's a past slot quoted in London time — anchoring to it ignores the client's actual Thursday 9am-12pm Eastern window.",
      },
      {
        text: "Meeting rooms must be booked through the portal.",
        kind: "noise",
        reason: "A logistics rule about rooms, not about when the client is free.",
      },
    ],
    explanation:
      "The essential snippet is the client's Thursday window (9am-12pm Eastern) — pick any time inside it. The tempting distractor is last week's 3pm London slot: reusing a past, differently-zoned time instead of reasoning from this week's stated window is how you'd set the wrong time. The report deadline and room-booking note were irrelevant.",
  },

  // D3 — two essentials, one tempting distractor (an over-budget venue), two noise.
  3: {
    topic: "venue booking",
    task: {
      senderName: "Elena Vasquez",
      senderRole: "Events Manager",
      senderInitials: "EV",
      message:
        "Recommend which venue I should book for our 80-person training day, and say why.",
    },
    goal: "Recommend a venue for the 80-person training day.",
    items: [
      {
        text: "Riverside Hall seats 120 and costs £3,200 for the day — it's our most popular venue.",
        kind: "distractor",
        reason: "Big enough and popular, so it's tempting — but at £3,200 it blows the £2,000 cap, so recommending it gives the wrong answer.",
      },
      {
        text: "The budget cap for the day is £2,000.",
        kind: "essential",
        reason: "The hard constraint that rules venues in or out — without it you can't judge affordability.",
      },
      {
        text: "The catering team prefers vegetarian menus.",
        kind: "noise",
        reason: "A catering preference — it doesn't bear on which room to book.",
      },
      {
        text: "Parkview Suite seats 90 and costs £1,800 for the day.",
        kind: "essential",
        reason: "The winning option: 90 seats covers 80 people and £1,800 fits under the cap.",
      },
      {
        text: "Last year's training day had 65 attendees.",
        kind: "noise",
        reason: "Last year's headcount is history — this year's brief is 80, which is the number that matters.",
      },
    ],
    explanation:
      "The two essentials decide it: Parkview Suite seats 90 (enough for 80) at £1,800, inside the £2,000 cap. Riverside Hall is the distractor — biggest and most popular, but £3,200 blows the budget. Catering preference and last year's headcount don't change the pick.",
  },

  // D4 — report compilation: pick the right DOCUMENTS for a Q3 sales review.
  // Two essential documents, three wrong-period/scope distractors, plus a
  // helpful template and one noise doc.
  4: {
    topic: "Q3 sales review",
    task: {
      senderName: "Raj Malhotra",
      senderRole: "Commercial Analyst",
      senderInitials: "RM",
      message:
        "I'm compiling the Q3 sales review for the board this week. From the document library, attach the ones I should actually build the report from.",
    },
    goal: "Compile an accurate Q3 (this year) sales review for the board.",
    items: [
      {
        text: "Q3 sales figures by region — this financial year.",
        kind: "essential",
        reason: "The core dataset the review is about: this year's Q3 numbers, broken down the way the board wants.",
      },
      {
        text: "Q2 sales figures by region — this financial year.",
        kind: "distractor",
        reason: "Right year, wrong quarter. Pulling Q2 numbers into a Q3 review reports the wrong period.",
      },
      {
        text: "Q3 commentary and highlights written by the regional leads — this year.",
        kind: "essential",
        reason: "The qualitative half of the review: this year's Q3 narrative that explains the figures.",
      },
      {
        text: "Q3 sales figures by region — last financial year.",
        kind: "distractor",
        reason: "Right quarter, wrong year. Useful as a comparison point only, but as the source it would report last year's results.",
      },
      {
        text: "The board's standard report template and section order.",
        kind: "helpful",
        reason: "Not a data source, but it shapes the format the board expects — fine to include, not essential.",
      },
      {
        text: "The office relocation FAQ for the new HQ.",
        kind: "noise",
        reason: "An internal facilities document with nothing to do with sales performance.",
      },
    ],
    explanation:
      "Build the report from this year's Q3 figures and this year's Q3 regional commentary. The two tempting distractors are the wrong-period documents — this year's Q2 and last year's Q3 — which look on-topic but would report the wrong numbers. The template is a helpful format guide; the relocation FAQ is noise.",
  },

  // D5 — boss round, report compilation: pick the right DOCUMENTS for an annual
  // supplier risk report. Two essentials, three distractors (superseded / wrong
  // scope / never adopted), one noise.
  5: {
    topic: "supplier risk report",
    task: {
      senderName: "Fiona Gallagher",
      senderRole: "Procurement Lead",
      senderInitials: "FG",
      message:
        "I need this year's supplier risk report compiled for the audit committee. Pick the documents I should base it on — be careful, the library has a few near-misses.",
    },
    goal: "Compile this year's supplier risk report for the audit committee.",
    items: [
      {
        text: "This year's completed supplier audit results.",
        kind: "essential",
        reason: "The current evidence base — the report is a read-out of this year's audit findings.",
      },
      {
        text: "Last year's supplier audit results.",
        kind: "distractor",
        reason: "Superseded. Basing this year's report on last year's audit reports stale risk.",
      },
      {
        text: "The current approved-supplier list (in force this year).",
        kind: "essential",
        reason: "Defines which suppliers are in scope right now — you can't assess risk without the live list.",
      },
      {
        text: "The marketing team's preferred-agency roster.",
        kind: "distractor",
        reason: "A different kind of vendor list for a different purpose — wrong scope for a procurement risk report.",
      },
      {
        text: "A draft supplier-risk policy that was proposed but never adopted.",
        kind: "distractor",
        reason: "Never came into force, so building the report on it would apply rules the company doesn't actually use.",
      },
      {
        text: "The staff parking allocation policy.",
        kind: "noise",
        reason: "An unrelated HR/facilities policy — no bearing on supplier risk.",
      },
    ],
    explanation:
      "Compile from this year's audit results and the current approved-supplier list. The three distractors are each a near-miss: last year's audit is superseded, the marketing agency roster is the wrong scope, and the never-adopted draft policy isn't in force. The parking policy is pure noise.",
  },
};

export function mockContextCalibrationRound(
  difficulty: number,
): ContextCalibrationScenario {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return withItemIds(BANK[d]);
}
