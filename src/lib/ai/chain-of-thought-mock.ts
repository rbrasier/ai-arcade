import {
  withOptionIds,
  type ChainOfThoughtScenario,
  type RawChainOfThoughtScenario,
} from "./chain-of-thought";

/**
 * Deterministic offline scenarios — one per difficulty (1-5) — so "Think It
 * Through" is fully playable with no AI provider configured. Following the same
 * pattern the live generator uses: easy rounds (1-2) have a CORRECT snap answer,
 * harder rounds (3-5) have a WRONG snap answer that falls for a plausible trap,
 * so both the "accept" and "make it think" calls come up across a play-through.
 */
const BANK: Record<number, RawChainOfThoughtScenario> = {
  // D1 — one simple rule; the snap answer is right (no deep working needed).
  1: {
    topic: "expense policy",
    task: {
      senderName: "Dana Okafor",
      senderRole: "Team Lead",
      senderInitials: "DO",
      message:
        "Quick one: our policy says any expense over £50 needs a receipt attached. Priya submitted a £42 taxi fare. Does she need to attach a receipt?",
    },
    question: "Does the £42 taxi fare need a receipt?",
    options: ["No — no receipt needed", "Yes — a receipt is required", "Only if it's a taxi"],
    snapAnswerIndex: 0,
    snapAnswerText: "No — she doesn't need a receipt.",
    reasoning: [
      "The rule: a receipt is required only when an expense is over £50.",
      "The taxi fare is £42.",
      "£42 is below the £50 threshold, so the rule doesn't trigger.",
    ],
    correctIndex: 0,
    explanation:
      "Correct answer: No. This is a single-step rule check — £42 is under the £50 threshold — so the quick answer was right and didn't need deep working.",
  },
  // D2 — two simple steps; the snap answer is still right.
  2: {
    topic: "delivery date",
    task: {
      senderName: "Marcus Lindqvist",
      senderRole: "Operations Coordinator",
      senderInitials: "ML",
      message:
        "An order ships today, Monday, and the courier quotes 2 business days for delivery (business days are Mon-Fri). Which day should the customer expect it?",
    },
    question: "Which day will the order arrive?",
    options: ["Tuesday", "Wednesday", "Thursday"],
    snapAnswerIndex: 1,
    snapAnswerText: "Wednesday.",
    reasoning: [
      "Ships Monday; count 2 business days forward.",
      "Business day 1 after Monday is Tuesday.",
      "Business day 2 is Wednesday — no weekend falls in between.",
    ],
    correctIndex: 1,
    explanation:
      "Correct answer: Wednesday. Two business days from Monday lands mid-week with no weekend to skip, so the quick answer held up.",
  },
  // D3 — the weekend-skip trap; the snap answer counts calendar days and is wrong.
  3: {
    topic: "support SLA",
    task: {
      senderName: "Priya Nair",
      senderRole: "Support Manager",
      senderInitials: "PN",
      message:
        "A ticket was logged on Thursday. Our SLA is to resolve within 3 business days (business days are Mon-Fri; weekends don't count). What's the resolution deadline?",
    },
    question: "What is the resolution deadline?",
    options: ["Sunday", "Monday", "Tuesday", "Friday"],
    snapAnswerIndex: 0,
    snapAnswerText: "Sunday.",
    reasoning: [
      "Start the count the day after Thursday.",
      "Business day 1 is Friday.",
      "Saturday and Sunday are weekend days — they don't count.",
      "Business day 2 is Monday; business day 3 is Tuesday.",
    ],
    correctIndex: 2,
    explanation:
      "Correct answer: Tuesday. The snap answer added 3 calendar days (Thu → Sun) and ignored the weekend. Counting business days skips Saturday and Sunday, landing on Tuesday.",
  },
  // D4 — multi-rule eligibility; the snap answer stops at the word "warning".
  4: {
    topic: "bonus eligibility",
    task: {
      senderName: "Tom Becker",
      senderRole: "HR Business Partner",
      senderInitials: "TB",
      message:
        "Bonus eligibility needs ALL of: employed over 12 months, a performance rating of 4 or higher, and no ACTIVE warning. Sam has been here 14 months, has a rating of 4, and had a warning that was formally cleared last month (so none is active now). Is Sam eligible?",
    },
    question: "Is Sam eligible for the bonus?",
    options: ["Eligible", "Not eligible", "Needs manager sign-off"],
    snapAnswerIndex: 1,
    snapAnswerText: "Not eligible — there's a warning on record.",
    reasoning: [
      "Rule 1: employed over 12 months — Sam is at 14 months. Pass.",
      "Rule 2: rating of 4 or higher — Sam's rating is 4. Pass.",
      "Rule 3: no active warning — Sam's warning was cleared last month, so none is active. Pass.",
      "All three conditions are met.",
    ],
    correctIndex: 0,
    explanation:
      "Correct answer: Eligible. The snap answer saw the word 'warning' and stopped. The rule is about an ACTIVE warning — Sam's was cleared, so all three conditions pass.",
  },
  // D5 — multi-step discount maths; the snap answer forgets the voucher step.
  5: {
    topic: "order total",
    task: {
      senderName: "Aisha Rahman",
      senderRole: "Finance Analyst",
      senderInitials: "AR",
      message:
        "A customer buys 3 items at £40 each. We take 10% off any order over £100, and THEN apply a £15 loyalty voucher. What's the final total they pay?",
    },
    question: "What is the final total?",
    options: ["£108", "£93", "£105", "£120"],
    snapAnswerIndex: 0,
    snapAnswerText: "£108.",
    reasoning: [
      "Subtotal: 3 items × £40 = £120.",
      "£120 is over £100, so take 10% off: £120 − £12 = £108.",
      "Then apply the £15 loyalty voucher: £108 − £15 = £93.",
    ],
    correctIndex: 1,
    explanation:
      "Correct answer: £93. The snap answer stopped after the 10% discount (£108) and forgot the final £15 voucher step. Working both steps in order gives £93.",
  },
};

export function mockChainOfThoughtRound(difficulty: number): ChainOfThoughtScenario {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return withOptionIds(BANK[d]);
}
