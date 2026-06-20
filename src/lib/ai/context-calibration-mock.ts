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
      },
      {
        text: "Our policy gives a full refund within 30 days of purchase; this order was placed 12 days ago.",
        kind: "essential",
      },
      {
        text: "Marketing is launching a summer campaign next month.",
        kind: "noise",
      },
      { text: "Our support Slack channel was renamed last week.", kind: "noise" },
    ],
    explanation:
      "Only the refund-window snippet mattered: 30-day policy, order placed 12 days ago, so the customer clearly qualifies. The other three were office noise that would only clutter the reply without changing it.",
  },

  // D2 — one essential, one gentle distractor (a stale time), two noise.
  2: {
    topic: "meeting time",
    task: {
      senderName: "Marcus Lindqvist",
      senderRole: "Team Coordinator",
      senderInitials: "ML",
      message:
        "Find a 30-minute slot to call our New York client this Thursday and suggest a time.",
    },
    goal: "Suggest a Thursday meeting time that works for the New York client.",
    items: [
      {
        text: "The quarterly report is due next Tuesday.",
        kind: "noise",
      },
      {
        text: "The client is in New York (Eastern Time) and is free 9am-12pm their time on Thursday.",
        kind: "essential",
      },
      {
        text: "Last week's catch-up with them happened at 3pm London time.",
        kind: "distractor",
      },
      { text: "Meeting rooms must be booked through the portal.", kind: "noise" },
    ],
    explanation:
      "The essential snippet is the client's Thursday window (9am-12pm Eastern). The tempting distractor — last week's 3pm London slot — sits outside that window and would set the wrong time. The report deadline and room-booking note were irrelevant.",
  },

  // D3 — two essentials, one tempting distractor (an over-budget venue), two noise.
  3: {
    topic: "venue booking",
    task: {
      senderName: "Priya Nair",
      senderRole: "Events Manager",
      senderInitials: "PN",
      message:
        "Recommend which venue I should book for our 80-person training day, and say why.",
    },
    goal: "Recommend a venue for the 80-person training day.",
    items: [
      {
        text: "Riverside Hall seats 120 and costs £3,200 for the day — it's our most popular venue.",
        kind: "distractor",
      },
      {
        text: "The budget cap for the day is £2,000.",
        kind: "essential",
      },
      {
        text: "The catering team prefers vegetarian menus.",
        kind: "noise",
      },
      {
        text: "Parkview Suite seats 90 and costs £1,800 for the day.",
        kind: "essential",
      },
      { text: "Last year's training day had 65 attendees.", kind: "noise" },
    ],
    explanation:
      "The two essentials decide it: Parkview Suite seats 90 (enough for 80) at £1,800, inside the £2,000 cap. Riverside Hall is the distractor — biggest and most popular, but £3,200 blows the budget. Catering preference and last year's headcount don't change the pick.",
  },

  // D4 — two essentials, three tempting distractors (wrong discount/plan/expired), one noise.
  4: {
    topic: "price quote",
    task: {
      senderName: "Tom Becker",
      senderRole: "Sales Associate",
      senderInitials: "TB",
      message:
        "A returning customer wants a quote for 50 units of the Pro plan. What total price do we give them?",
    },
    goal: "State the total price to quote for 50 Pro-plan units.",
    items: [
      {
        text: "New customers get a 25% discount on their first order.",
        kind: "distractor",
      },
      {
        text: "The Pro plan's list price is £20 per unit.",
        kind: "essential",
      },
      {
        text: "Last quarter we ran a 15% flash sale that has now ended.",
        kind: "distractor",
      },
      {
        text: "Returning customers get 10% off the list price.",
        kind: "essential",
      },
      {
        text: "The Enterprise plan is £35 per unit.",
        kind: "distractor",
      },
      { text: "Finance closes the books on the 30th of each month.", kind: "noise" },
    ],
    explanation:
      "Quote = 50 × £20 = £1,000, less the 10% returning-customer discount = £900. The three distractors each mislead: the 25% is for NEW customers, the 15% flash sale has ended, and the £35 Enterprise price is the wrong plan. The book-closing date is noise.",
  },

  // D5 — boss round: two essentials, three distractors (wrong project/wish/calendar), one noise.
  5: {
    topic: "delivery date",
    task: {
      senderName: "Aisha Rahman",
      senderRole: "Project Manager",
      senderInitials: "AR",
      message:
        "When should I promise the client we'll deliver the report? Give me a date.",
    },
    goal: "Give the client a realistic delivery date for the report.",
    items: [
      {
        text: "A different project's report is due in 3 business days.",
        kind: "distractor",
      },
      {
        text: "The work takes 5 business days once it starts, and it starts this Monday.",
        kind: "essential",
      },
      {
        text: "The client originally asked for a 2-day turnaround.",
        kind: "distractor",
      },
      {
        text: "Business days are Mon-Fri, and the team is off this coming Friday for a public holiday.",
        kind: "essential",
      },
      {
        text: "A similar report last month took 7 calendar days end to end.",
        kind: "distractor",
      },
      { text: "The report template was refreshed last week.", kind: "noise" },
    ],
    explanation:
      "Counting 5 business days from Monday, skipping the public-holiday Friday, lands delivery on the following Monday. The distractors all pull elsewhere: the 3-day deadline is a different project, the 2-day turnaround was the client's wish (not the estimate), and the 7-calendar-day figure was a different job. The template refresh is noise.",
  },
};

export function mockContextCalibrationRound(
  difficulty: number,
): ContextCalibrationScenario {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return withItemIds(BANK[d]);
}
