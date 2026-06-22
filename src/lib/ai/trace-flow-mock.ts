import {
  withFlow,
  type RawTraceFlowScenario,
  type TraceFlowScenario,
} from "./trace-flow";
import { tierInfoForDifficulty } from "../trace-flow-tiers";

/**
 * Deterministic offline workflows — one per difficulty (1-5) — so "Trace the
 * Flow" is fully playable with no AI provider configured. The SHAPE escalates
 * with difficulty (clean line → broken hand-off → reformatted hand-off →
 * parallel branch → loop-back), mirroring the live generator and the shape
 * tiers in `trace-flow-tiers.ts`.
 *
 * Steps are authored in TRUE order here; `withFlow` shuffles the id labelling so
 * the stored/served ids leak no ordering, and the generate route serves the tray
 * shuffled. Each scenario's own sender roster is distinct from every other game's.
 */
const BANK: Record<number, RawTraceFlowScenario> = {
  // D1 (clean) — expense claim: a tidy four-step pipeline, every hand-off sound.
  1: {
    topic: "expense claim",
    workflowName: "Expense claim processing",
    brief: {
      senderName: "Marcus Bellweather",
      senderRole: "Team Coordinator",
      senderInitials: "MB",
      message:
        "Honestly I just do these on autopilot. Someone emails me their completed claim form, I check the receipts line up with what's on the form, then I enter the verified claim into the finance system, and finally I email them the payment reference so they know it's done. Can you lay that out as a proper sequence of steps?",
    },
    goal: "Rebuild the expense claim process into the order it actually happens.",
    steps: [
      {
        title: "Receive the claim form",
        detail: "The employee emails in their completed expense claim form.",
        input: "an emailed, completed expense claim form",
        output: "a completed claim form saved in the shared folder",
      },
      {
        title: "Check receipts against the form",
        detail: "Each receipt is matched to the lines on the claim.",
        input: "a completed claim form saved in the shared folder",
        output: "a verified claim with every receipt matched",
      },
      {
        title: "Enter the claim into the finance system",
        detail: "The verified claim is keyed into finance for payment.",
        input: "a verified claim with every receipt matched",
        output: "a logged claim with a payment reference",
      },
      {
        title: "Email the payment reference to the employee",
        detail: "The employee is told their claim is logged and paid.",
        input: "a logged claim with a payment reference",
        output: "a confirmation email sent to the employee",
      },
    ],
    brokenHandoffs: [],
    explanation:
      "The order is: receive the form → check receipts against it → enter the verified claim into finance → email the payment reference back. Each step needs exactly what the step before it produced, so the work flows straight through with no broken hand-offs — a clean chain.",
  },

  // D2 (break / lost) — invoice approval: the matching step drops the bank
  // details the first step captured, so payment can't run.
  2: {
    topic: "invoice approval",
    workflowName: "Supplier invoice approval",
    brief: {
      senderName: "Priya Raman",
      senderRole: "Accounts Payable Lead",
      senderInitials: "PR",
      message:
        "A supplier invoice comes in by email, I log it, then I match it against the purchase order, get a manager to sign it off, and schedule the payment. Lately payments keep stalling at the end and I can't put my finger on why — can you map the steps and see where a hand-off is dropping something?",
    },
    goal: "Reconstruct the invoice approval chain and flag the hand-off that loses information.",
    steps: [
      {
        title: "Log the supplier invoice",
        detail: "The emailed invoice is recorded in the system.",
        input: "a supplier's emailed invoice (line items, total and bank details)",
        output: "a logged invoice record with line items, total and the supplier's bank details",
      },
      {
        title: "Match against the purchase order",
        detail: "The invoice is checked against the matching PO.",
        input: "the invoice's line items and total",
        output: "a matched invoice (line items and total verified)",
      },
      {
        title: "Get manager sign-off",
        detail: "A manager approves the matched invoice for payment.",
        input: "a matched invoice (line items and total verified)",
        output: "an approved invoice",
      },
      {
        title: "Schedule the payment",
        detail: "Payment is set up to the supplier's bank account.",
        input: "an approved invoice with the supplier's bank details",
        output: "a scheduled payment to the supplier",
      },
    ],
    brokenHandoffs: [
      {
        fromIndex: 0,
        toIndex: 1,
        reason:
          "Logging captured the supplier's bank details, but the matching step kept only the line items and total — so the bank details are dropped here, and by the time payment is scheduled they're gone and it stalls.",
      },
    ],
    explanation:
      "The order is: log the invoice → match it to the PO → manager sign-off → schedule payment. The broken hand-off is the very first one: the log captured the bank details, but the matching step only carried the line items and total forward, losing the bank details the final payment step needs. That's why payments stall at the end — the data was dropped near the start.",
  },

  // D3 (reformat) — survey reporting: the summary turns responses into prose, but
  // the dashboard needs the per-question numbers.
  3: {
    topic: "survey reporting",
    workflowName: "Customer survey reporting",
    brief: {
      senderName: "Tomas Lindqvist",
      senderRole: "Insights Analyst",
      senderInitials: "TL",
      message:
        "Once a survey closes I export the responses, summarise the main themes, build the metrics dashboard, and send the report round. The dashboard's been coming out empty though. Can you trace the steps and find where the data stops being usable?",
    },
    goal: "Rebuild the reporting chain and flag the hand-off that reshapes the data into the wrong form.",
    steps: [
      {
        title: "Export the survey responses",
        detail: "The closed survey is exported as raw data.",
        input: "a closed customer survey",
        output: "a CSV of individual survey responses, with per-question scores",
      },
      {
        title: "Summarise the themes",
        detail: "The responses are written up into the headline themes.",
        input: "a CSV of individual survey responses, with per-question scores",
        output: "a written narrative summary of the top themes",
      },
      {
        title: "Build the metrics dashboard",
        detail: "The dashboard charts the per-question scores.",
        input: "per-question numeric scores to chart",
        output: "a dashboard of score charts",
      },
      {
        title: "Send the report",
        detail: "The summary and dashboard go out to stakeholders.",
        input: "a dashboard of score charts and a written summary",
        output: "a report emailed to stakeholders",
      },
    ],
    brokenHandoffs: [
      {
        fromIndex: 1,
        toIndex: 2,
        reason:
          "The summarise step turned the responses into a prose write-up, but the dashboard needs the per-question numbers to chart — the figures existed in the export, they were just reshaped into paragraphs the charts can't read, so the dashboard comes out empty.",
      },
    ],
    explanation:
      "The order is: export the responses → summarise the themes → build the dashboard → send the report. The broken hand-off is summary → dashboard: the summary reformatted the numeric responses into prose, so the dashboard has no numbers to chart. The information wasn't lost, it was reshaped into a form the next step can't use — a subtler break than losing it outright.",
  },

  // D4 (parallel) — campaign launch: design and copy run in parallel off the
  // brief; the publish hand-off loses the real tracking links.
  4: {
    topic: "campaign launch",
    workflowName: "Marketing campaign launch",
    brief: {
      senderName: "Naomi Okafor",
      senderRole: "Marketing Producer",
      senderInitials: "NO",
      message:
        "Once the brief's approved, two things happen at the same time — a designer builds the graphics and a writer drafts the copy, neither waits on the other. Then we assemble the landing page from both and push it live. The last launch went out with dead tracking links, so trace the flow, show me the two parallel jobs, and find the broken hand-off.",
    },
    goal: "Reconstruct the launch, mark the two steps that run in parallel, and flag the broken hand-off.",
    steps: [
      {
        title: "Receive the approved brief",
        detail: "The signed-off campaign brief kicks things off.",
        input: "a signed-off campaign brief",
        output: "an approved campaign brief shared with the team",
      },
      {
        title: "Design the graphics",
        detail: "A designer produces the campaign visuals from the brief.",
        input: "an approved campaign brief shared with the team",
        output: "finished campaign graphics",
        parallelGroup: "pg1",
      },
      {
        title: "Write the copy",
        detail: "A writer drafts the campaign copy from the brief.",
        input: "an approved campaign brief shared with the team",
        output: "finished campaign copy",
        parallelGroup: "pg1",
      },
      {
        title: "Assemble the landing page",
        detail: "Graphics and copy are built into the landing page.",
        input: "finished campaign graphics and finished campaign copy",
        output: "a built landing page with placeholder tracking links",
      },
      {
        title: "Publish the page",
        detail: "The finished page is pushed live to customers.",
        input: "a built landing page with the real tracking links in place",
        output: "a live campaign page",
      },
    ],
    brokenHandoffs: [
      {
        fromIndex: 3,
        toIndex: 4,
        reason:
          "The page was assembled with placeholder tracking links, and publish pushed it live as-is — the real tracking links never replaced the placeholders, so every click on the launched page went nowhere.",
      },
    ],
    explanation:
      "The brief comes first; then designing the graphics and writing the copy run in PARALLEL — neither needs the other, they both work straight from the brief — before the landing page is assembled from both and published. The two parallel steps can sit in either order. The broken hand-off is assemble → publish: the page went live still carrying placeholder tracking links instead of the real ones.",
  },

  // D5 (loopback) — grant review: the panel review loops back to the revise step
  // on rejection; the approved hand-off drops the awarded amount.
  5: {
    topic: "grant review",
    workflowName: "Grant application review",
    brief: {
      senderName: "Idris Faraj",
      senderRole: "Programme Manager",
      senderInitials: "IF",
      message:
        "Applicants submit a draft, a caseworker completes it, then the panel reviews it against the criteria. If the panel rejects it, it goes straight back to the caseworker to revise and round it goes again. Once it's approved we issue the grant agreement and notify the applicant. Two problems: map that rework loop for me, and agreements keep going out without the award amount — find where that drops.",
    },
    goal: "Reconstruct the review, identify the rework loop-back, and flag the hand-off that loses the award amount.",
    steps: [
      {
        title: "Receive the draft application",
        detail: "An applicant submits their draft application.",
        input: "a submitted draft grant application",
        output: "a logged draft application",
      },
      {
        title: "Caseworker completes the application",
        detail: "A caseworker fills the gaps and readies it for review.",
        input: "a logged draft application (or one returned with revision notes)",
        output: "a completed application ready for panel review",
      },
      {
        title: "Panel reviews against the criteria",
        detail: "The panel approves with an award, or rejects with notes.",
        input: "a completed application ready for panel review",
        output: "an approved application with the awarded amount, or a rejection with revision notes",
      },
      {
        title: "Issue the grant agreement",
        detail: "An agreement is drawn up for the approved grant.",
        input: "an approved application",
        output: "a signed grant agreement",
      },
      {
        title: "Notify the applicant",
        detail: "The applicant is told their grant is confirmed.",
        input: "a signed grant agreement",
        output: "a confirmation sent to the applicant",
      },
    ],
    brokenHandoffs: [
      {
        fromIndex: 2,
        toIndex: 3,
        reason:
          "The panel's approval set the awarded amount, but the agreement step took only 'an approved application' and dropped the amount — so the grant agreement is issued without the figure it's supposed to commit.",
      },
    ],
    loopBackFromIndex: 2,
    loopBackToIndex: 1,
    loopBackReason:
      "When the panel rejects an application, it goes back to the caseworker to revise and be reviewed again — a rework loop from the review step to the completion step.",
    explanation:
      "The order is: receive the draft → caseworker completes it → panel reviews it → (if approved) issue the agreement → notify the applicant. The rework loop runs from the panel review back to the caseworker step: rejected applications return there to be revised and reviewed again. The broken hand-off is review → issue agreement: the approval set the award amount but the agreement step dropped it, so agreements go out with no figure.",
  },
};

export function mockTraceFlowRound(difficulty: number): TraceFlowScenario {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  const tier = tierInfoForDifficulty(d);
  return withFlow(BANK[d], tier.tier, tier.shape);
}
