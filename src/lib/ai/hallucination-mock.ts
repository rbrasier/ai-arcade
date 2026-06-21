import { withClaimIds, type HallucinationScenario } from "./hallucination";

/**
 * Deterministic offline scenarios — one per difficulty (1-5) — so the game is
 * fully playable with no AI provider configured. The rounds are framed by model
 * tier (see src/lib/hallucination-tiers.ts): the quick/small model (D1)
 * fabricates freely and obviously, the mid models (D2-3) slip more rarely and
 * subtly, and the frontier models (D4-5) are highly reliable — D4 has a single
 * subtle fabrication buried in its reasoning, and D5 is perfectly sound. Each
 * has a distinct topic so a play-through never repeats a theme.
 */
const BANK: Record<number, Parameters<typeof withClaimIds>[0]> = {
  // D1 — QUICK MODEL: fabricates freely. Two blatant invented statistics.
  1: {
    topic: "customer churn",
    task: {
      senderName: "Naomi Okonkwo",
      senderRole: "VP, Customer Success",
      senderInitials: "NO",
      message:
        "Can you pull together the key drivers of our Q3 churn and recommend two retention actions? Cite the research.",
    },
    attachments: ["Q3_churn_analysis.csv", "support_tickets_q3.pdf", "nps_survey_q3.xlsx"],
    promptText:
      "Summarise the key drivers of Q3 customer churn and recommend two retention actions — cite the attached research.",
    reasoningSteps: [
      "Reading Q3_churn_analysis.csv — churn rose 4.2% to 5.1% quarter over quarter.",
      "Scanning support_tickets_q3.pdf — top theme is onboarding confusion.",
      "Checking nps_survey_q3.xlsx — detractors mention missing integrations.",
      "Drafting a summary plus two retention actions.",
    ],
    claims: [
      { text: "Churn rose from 4.2% to 5.1% quarter over quarter,", hallucination: false },
      { text: "driven primarily by onboarding confusion, which support tickets show in exactly 73% of cases.", hallucination: true },
      { text: "Notably, exactly 68.4% of detractors cited a missing Salesforce integration.", hallucination: true },
      { text: "We recommend a guided onboarding checklist", hallucination: false },
      { text: "and a quarterly integration roadmap review.", hallucination: false },
    ],
    explanations: [
      "Two fabrications — this small, quick model invents numbers freely. The \"exactly 73% of cases\" figure is made up: the tickets reasoning named onboarding confusion as the top theme but gave no percentage.",
      "The oddly precise 68.4% / Salesforce figure is also fabricated — the NPS notes only said \"missing integrations\" with no number or named vendor.",
      "The 4.2% to 5.1% churn rise checks out against the CSV, and both recommendations are sound.",
    ],
  },
  // D2 — MID MODEL: a single misspelled person's name.
  2: {
    topic: "keynote speaker bio",
    task: {
      senderName: "Gregor Halvorsen",
      senderRole: "Head of Comms",
      senderInitials: "GH",
      message:
        "Draft a short bio paragraph on the keynote speaker for the launch event. Keep it factual.",
    },
    attachments: ["speaker_brief.docx", "event_runsheet.pdf"],
    promptText: "Write a two-sentence factual bio of the keynote speaker from the brief.",
    reasoningSteps: [
      "Reading speaker_brief.docx — name is Dr. Katalin Karikó, mRNA pioneer.",
      "Confirming her 2023 Nobel Prize in Physiology or Medicine.",
      "Drafting a concise, factual bio.",
    ],
    claims: [
      { text: "Dr. Katalin Kariko is a biochemist recognised for her pioneering mRNA research,", hallucination: true },
      { text: "work that underpinned modern mRNA vaccines.", hallucination: false },
      { text: "She shared the 2023 Nobel Prize in Physiology or Medicine.", hallucination: false },
    ],
    explanations: [
      "The surname is misspelled: the brief and the reasoning both give \"Karikó\", but the answer drops the accent and writes \"Kariko\" — a classic name-error hallucination.",
      "The mRNA contribution and the 2023 Nobel are both accurate.",
    ],
  },
  // D3 — MID MODEL: a citation to a source that was never provided.
  3: {
    topic: "dashboard adoption",
    task: {
      senderName: "Mei Tanaka",
      senderRole: "Product Lead",
      senderInitials: "MT",
      message: "Summarise what our usage data says about the new dashboard and cite sources.",
    },
    attachments: ["dashboard_usage.csv", "feature_feedback.pdf"],
    promptText: "Summarise adoption of the new dashboard from the attached data, with citations.",
    reasoningSteps: [
      "Reading dashboard_usage.csv — weekly active users up 23% since launch.",
      "Scanning feature_feedback.pdf — users praise the filters, dislike load time.",
      "Writing a short summary with citations to the attachments.",
    ],
    claims: [
      { text: "Weekly active users are up 23% since the dashboard launched [usage.csv].", hallucination: false },
      { text: "Users consistently praise the new filtering but flag slow load times [feedback.pdf].", hallucination: false },
      { text: "A Gartner benchmark shows this adoption rate is top-quartile for B2B SaaS [Gartner 2024].", hallucination: true },
    ],
    explanations: [
      "The \"Gartner 2024\" benchmark is fabricated — no such report was attached or referenced anywhere in the files.",
      "The 23% lift and the filter/load-time feedback both trace to the provided attachments.",
    ],
  },
  // D4 — FRONTIER MODEL: highly reliable, so just ONE subtle fabrication — a
  // sign flip buried in the reasoning. Everything else (including the
  // correctly-spelled CFO and the cited figure) is sound; don't over-flag.
  4: {
    topic: "gross margin",
    task: {
      senderName: "Oliver Brandt",
      senderRole: "Finance Manager",
      senderInitials: "OB",
      message: "What was our Q2 gross margin and how did it move? Keep it tight for the board note.",
    },
    attachments: ["q2_financials.xlsx", "board_template.docx"],
    promptText: "State Q2 gross margin and the quarter-over-quarter movement from the financials.",
    reasoningSteps: [
      "Reading q2_financials.xlsx — gross margin is 61% in Q2, down from 64% in Q1.",
      "So margin declined 3 points quarter over quarter.",
      "CFO Priya Venkataraman signed off the figures.",
      "Drafting the board note line.",
    ],
    claims: [
      { text: "Q2 gross margin came in at 61%.", hallucination: false },
      { text: "That represents a 3-point improvement over Q1,", hallucination: true },
      { text: "as confirmed in the Q2 financials [q2_financials.xlsx],", hallucination: false },
      { text: "and signed off by CFO Priya Venkataraman.", hallucination: false },
      { text: "We recommend holding pricing steady into Q3.", hallucination: false },
    ],
    explanations: [
      "Even a frontier model slips occasionally — here just once, and subtly. The reasoning says margin fell from 64% to 61% — a 3-point decline — yet the answer claims a 3-point improvement. The only clue was buried in the reasoning steps.",
      "Everything else is sound: the 61% figure, the citation to q2_financials.xlsx, the correctly-spelled CFO Priya Venkataraman, and the pricing recommendation. Flagging any of those would be a false accusation.",
    ],
  },
  // D5 — FRONTIER MODEL: zero fabrications. The strongest model got it right —
  // verify the claims and don't flag anything.
  5: {
    topic: "warehouse safety",
    task: {
      senderName: "Sandrine Dubois",
      senderRole: "Director of Operations",
      senderInitials: "SD",
      message: "Give me the headline from the warehouse incident report and one corrective action.",
    },
    attachments: ["incident_report_w34.pdf", "safety_log.csv"],
    promptText: "Summarise the week-34 warehouse incident and propose one corrective action.",
    reasoningSteps: [
      "Reading incident_report_w34.pdf — one forklift near-miss, no injuries.",
      "Cross-checking safety_log.csv — third near-miss in the loading bay this quarter.",
      "Proposing a corrective action grounded in the log.",
    ],
    claims: [
      { text: "Week 34 saw a forklift near-miss in the loading bay with no injuries reported.", hallucination: false },
      { text: "It was the third loading-bay near-miss logged this quarter.", hallucination: false },
      { text: "We recommend adding floor markings and a spotter requirement in that bay.", hallucination: false },
    ],
    explanations: [
      "Every claim is supported by the incident report and safety log — there is no fabrication here. At higher levels, not flagging anything is sometimes the correct call.",
    ],
  },
};

export function mockHallucinationRound(difficulty: number): HallucinationScenario {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return withClaimIds(BANK[d]);
}
