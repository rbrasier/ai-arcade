import {
  withStepIds,
  type CheckpointPlacementScenario,
  type RawCheckpointPlacementScenario,
} from "./checkpoint-placement";
import { tierForDifficulty } from "../checkpoint-tiers";

/**
 * Deterministic offline workflows — one per difficulty (1-5) — so "In the Loop"
 * is fully playable with no AI provider configured. Stakes rise with difficulty
 * (Low → Medium → High), mirroring the live generator: low-risk rounds barely
 * need a human (so the lesson is "don't over-checkpoint"), while high-risk rounds
 * plant several irreversible steps that must be guarded alongside tempting traps
 * that must not.
 *
 * Steps are NOT ordered by kind, so position carries no signal — the player has
 * to read each step's impact line.
 */
const BANK: Record<number, RawCheckpointPlacementScenario> = {
  // D1 (low) — meeting notes: almost all safe, one trap, one external send.
  1: {
    topic: "meeting notes",
    workflowName: "Meeting notes assistant",
    volumePerQuarter: 24000,
    brief: {
      senderName: "Renée Salgado",
      senderRole: "Operations Lead",
      senderInitials: "RS",
      message:
        "We've automated our meeting write-ups. Have a look at the steps and add a human checkpoint anywhere a person really needs to review before it runs. Don't slow it down where you don't have to.",
    },
    goal: "Place checkpoints so nothing risky goes out unreviewed, while keeping the write-up fast.",
    steps: [
      {
        title: "Pull the transcript",
        detail: "The AI fetches the recording's transcript into a working doc.",
        impact: "Internal only and fully reversible — it's just reading a file.",
        manualMinutes: 2,
        kind: "safe",
      },
      {
        title: "Email the summary to the external client",
        detail: "The AI sends the finished summary straight to the client.",
        impact: "Leaves the company and can't be unsent — the client sees it as-is.",
        manualMinutes: 6,
        kind: "critical",
      },
      {
        title: "Draft the summary",
        detail: "The AI writes a draft summary of the discussion in the doc.",
        impact: "Just a draft saved in the notes doc; nothing is sent.",
        manualMinutes: 8,
        kind: "safe",
      },
      {
        title: "Post the notes to the team's internal channel",
        detail: "The AI posts the write-up to the team's private channel.",
        impact: "Internal to the team and can be edited or deleted afterwards.",
        manualMinutes: 3,
        kind: "trap",
      },
      {
        title: "Highlight action items",
        detail: "The AI pulls out action items into an editable list.",
        impact: "An internal list anyone can change later.",
        manualMinutes: 4,
        kind: "safe",
      },
    ],
    explanation:
      "Only the external client email truly needs a human — once it's sent it can't be taken back. Posting to the team channel feels like 'publishing', but it's internal and editable, so it's a trap: a checkpoint there just adds delay. Pulling the transcript, drafting, and listing action items are all safe, reversible, internal steps.",
  },

  // D2 (medium) — submission screening: one auto-action that hits a person.
  2: {
    topic: "submission screening",
    workflowName: "Submission screening pipeline",
    volumePerQuarter: 9000,
    brief: {
      senderName: "Devang Mehta",
      senderRole: "Compliance Analyst",
      senderInitials: "DM",
      message:
        "This screens incoming submissions for policy issues. Tell me where a human has to be in the loop before anything happens to a submitter — but keep it lean.",
    },
    goal: "Guard the steps that act on a submitter, without gating the harmless internal ones.",
    steps: [
      {
        title: "Scan for missing fields",
        detail: "The AI checks each submission for incomplete sections.",
        impact: "Internal check; nothing is decided or sent.",
        manualMinutes: 3,
        kind: "safe",
      },
      {
        title: "Auto-reject flagged submissions and notify the applicant",
        detail: "The AI rejects anything it judged a violation and emails the applicant.",
        impact: "Acts on a real person and sends an external rejection that's hard to walk back.",
        manualMinutes: 8,
        kind: "critical",
      },
      {
        title: "Flag possible policy violations for review",
        detail: "The AI marks submissions that might breach policy.",
        impact: "Just an internal flag in a queue — reversible, and no one is told yet.",
        manualMinutes: 2,
        kind: "trap",
      },
      {
        title: "Sort clean submissions into the review folder",
        detail: "The AI files compliant entries for the team.",
        impact: "Internal filing; files can be moved back.",
        manualMinutes: 2,
        kind: "safe",
      },
      {
        title: "Post a daily submission count to the dashboard",
        detail: "The AI updates an internal tally.",
        impact: "An internal number on a dashboard; no decision attached.",
        manualMinutes: 1,
        kind: "safe",
      },
    ],
    explanation:
      "The auto-reject step is the one that must have a human: it judges a person and sends an external rejection that's hard to undo. Flagging for review is the trap — 'violation' sounds serious, but a flag is internal and reversible, so a person hasn't been affected yet. Scanning, filing and the dashboard tally are all safe internal steps.",
  },

  // D3 (medium) — expense approval: two money/person actions, one tempting flag.
  3: {
    topic: "expense approval",
    workflowName: "Expense approval flow",
    volumePerQuarter: 15000,
    brief: {
      senderName: "Carla Jensen",
      senderRole: "Finance Manager",
      senderInitials: "CJ",
      message:
        "Our expense approvals now run automatically. Add human checkpoints where money actually moves or where we contact someone — but I don't want a sign-off on every single step.",
    },
    goal: "Guard the steps that move money or reach an employee; leave the internal ones to run.",
    steps: [
      {
        title: "Extract amounts from receipts",
        detail: "The AI reads each receipt and pulls the totals.",
        impact: "Internal parsing; the figures can be corrected.",
        manualMinutes: 3,
        kind: "safe",
      },
      {
        title: "Auto-approve expenses under £50 and reimburse",
        detail: "The AI approves small claims and triggers the payment.",
        impact: "Real money leaves the account and is hard to claw back.",
        manualMinutes: 5,
        kind: "critical",
      },
      {
        title: "Flag over-limit expenses for finance",
        detail: "The AI routes claims above the cap to a finance queue.",
        impact: "Just moves the claim to a human queue — internal and reversible.",
        manualMinutes: 2,
        kind: "trap",
      },
      {
        title: "Email employees whose claims were rejected",
        detail: "The AI sends rejection notes to the claimants.",
        impact: "Goes to a real person and can't be unsent.",
        manualMinutes: 4,
        kind: "critical",
      },
      {
        title: "Update the internal spend tracker",
        detail: "The AI logs the day's totals in a shared sheet.",
        impact: "An internal record that can be edited.",
        manualMinutes: 2,
        kind: "safe",
      },
    ],
    explanation:
      "Two steps need a human: auto-reimbursing (money out, hard to recover) and emailing rejected employees (external, can't unsend). Routing over-limit claims to finance is the trap — 'over-limit' feels risky, but it only moves the claim to a human queue, so a checkpoint there is wasted. Reading receipts and updating the tracker are safe internal steps.",
  },

  // D4 (high) — refund/chargeback: irreversible money + dispute, two traps.
  4: {
    topic: "refund pipeline",
    workflowName: "Refund & chargeback pipeline",
    volumePerQuarter: 6000,
    brief: {
      senderName: "Yusuf Adebayo",
      senderRole: "Payments Lead",
      senderInitials: "YA",
      message:
        "High-value refunds now run through this automatically. I need humans on the steps that can't be undone — but don't choke the whole pipeline with sign-offs.",
    },
    goal: "Guard every irreversible money or dispute action; resist checkpointing the reversible drafts.",
    steps: [
      {
        title: "Pull the order and payment history",
        detail: "The AI gathers the customer's order and transaction record.",
        impact: "Internal read-only lookup; changes nothing.",
        manualMinutes: 3,
        kind: "safe",
      },
      {
        title: "Issue refunds over £500 to the customer's card",
        detail: "The AI pushes the refund to the original card.",
        impact: "Money leaves the account immediately and can't be reversed.",
        manualMinutes: 4,
        kind: "critical",
      },
      {
        title: "Draft a recommended refund decision",
        detail: "The AI writes up a suggested approve/deny with reasons.",
        impact: "A draft recommendation only — nothing is paid or sent yet.",
        manualMinutes: 6,
        kind: "trap",
      },
      {
        title: "Close the dispute with the payment processor",
        detail: "The AI accepts the chargeback and closes the case externally.",
        impact: "An external, final action that can't be reopened on our side.",
        manualMinutes: 5,
        kind: "critical",
      },
      {
        title: "Flag suspected fraud for the risk team",
        detail: "The AI routes questionable cases to a human risk queue.",
        impact: "Just an internal flag — reversible, and no decision is made yet.",
        manualMinutes: 2,
        kind: "trap",
      },
      {
        title: "Log the outcome in the ledger",
        detail: "The AI records what happened in the internal ledger.",
        impact: "An internal record entry that can be amended.",
        manualMinutes: 2,
        kind: "safe",
      },
    ],
    explanation:
      "Two steps are irreversible and must be guarded: issuing the refund (money gone) and closing the dispute (final, external). The draft recommendation and the fraud flag are traps — both sound high-stakes, but one is just a draft and the other only moves a case to a human queue, so neither has acted yet. The lookup and ledger entry are safe internal steps; gating all four would have stalled a pipeline built for speed.",
  },

  // D5 (high, boss) — staffing decisions: three life-changing actions, two
  // tempting "judges people" drafts.
  5: {
    topic: "staffing review",
    workflowName: "Workforce review pipeline",
    volumePerQuarter: 200,
    brief: {
      senderName: "Bridget Kowalski",
      senderRole: "HR Director",
      senderInitials: "BK",
      message:
        "This drafts and runs our restructuring decisions from performance data. Put humans exactly where they must be accountable — and nowhere they'd just be rubber-stamping. Get this one right.",
    },
    goal: "Keep a human accountable for every life-changing call, without gating the reversible drafts.",
    steps: [
      {
        title: "Compile each employee's performance metrics",
        detail: "The AI gathers scores and review notes into one view.",
        impact: "Internal data-gathering; the figures can be corrected.",
        manualMinutes: 10,
        kind: "safe",
      },
      {
        title: "Rank employees by a performance score",
        detail: "The AI orders staff from highest to lowest score.",
        impact: "An internal ranking only — reversible, and no one acts on it yet.",
        manualMinutes: 4,
        kind: "trap",
      },
      {
        title: "Draft development plans for low scorers",
        detail: "The AI writes suggested improvement plans.",
        impact: "Drafts saved for review; nothing is shared with anyone yet.",
        manualMinutes: 12,
        kind: "trap",
      },
      {
        title: "Select people for redundancy from the ranking",
        detail: "The AI picks who is let go based on the scores.",
        impact: "A life-changing judgement about real people that must be owned by a human.",
        manualMinutes: 15,
        kind: "critical",
      },
      {
        title: "Send redundancy notices to those selected",
        detail: "The AI emails the formal notices.",
        impact: "Irreversible, external and legally serious once sent.",
        manualMinutes: 5,
        kind: "critical",
      },
      {
        title: "File the termination paperwork with HR and legal",
        detail: "The AI lodges the formal records.",
        impact: "A formal legal record that's hard to undo.",
        manualMinutes: 8,
        kind: "critical",
      },
    ],
    explanation:
      "Three steps are accountable, life-changing calls that demand a human: selecting people for redundancy, sending the notices, and filing the legal paperwork. Ranking staff and drafting development plans are the traps — they judge people, so they feel like they need oversight, but both are reversible internal drafts that no one acts on, so a checkpoint there only rubber-stamps and slows things. Compiling the metrics is a safe internal step.",
  },
};

export function mockCheckpointPlacementRound(
  difficulty: number,
): CheckpointPlacementScenario {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return withStepIds(BANK[d], tierForDifficulty(d));
}
