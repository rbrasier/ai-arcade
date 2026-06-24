import {
  withStageIds,
  type IdeationChatResult,
  type IdeationMessage,
  type RawWorkflowRedesignScenario,
  type ValidationCritique,
  type WorkflowRedesignScenario,
} from "./workflow-redesign";
import { CAPABILITY_BY_KIND } from "../workflow-redesign-blocks";
import type { StageBuild, WorkflowImpact } from "../workflow-redesign-scoring";

/**
 * Deterministic offline scenarios — one per seeded scenario key — so the
 * Workflow Redesign Challenge is fully playable with no AI provider configured.
 * Each carries the same hidden ground truth the live generator would, so the
 * deterministic scorer behaves identically online and offline.
 */
const BANK: Record<string, RawWorkflowRedesignScenario> = {
  "hr-onboarding": {
    topic: "HR onboarding",
    workflowName: "New-hire onboarding",
    brief: {
      senderName: "Lena Ortiz",
      senderRole: "People Operations Lead",
      senderInitials: "LO",
      message:
        "Onboarding a new hire eats two days of my team's week — we re-key documents, chase missing forms and write every welcome by hand. Redesign it around AI: pick the right capability for each step, the right way to build it, and put a human in the loop only where it truly matters.",
    },
    goal: "Cut the manual load and turnaround while keeping every legally-sensitive decision defensible.",
    volumePerMonth: 90,
    stages: [
      {
        name: "Pull key details from submitted documents",
        painPoint:
          "HR reads each contract, ID and certificate by hand and re-types names, dates and numbers into the HR system.",
        timeCost: "~45 min/hire",
        manualMinutes: 45,
        bestCapability: "extract",
        acceptableCapabilities: ["extract", "summarise"],
        bestImpl: "custom-app",
        acceptableImpls: ["custom-app", "llm"],
        checkpointKind: "safe",
        rationale:
          "High-volume, structured document parsing that feeds the HR system is exactly where a tailored custom application earns its build — and it's just populating a draft record, so it's reversible and doesn't need a human gate.",
      },
      {
        name: "Confirm right-to-work eligibility and approve",
        painPoint:
          "An officer manually interprets each candidate's documents against eligibility rules to decide if they can be hired.",
        timeCost: "~20 min/hire",
        manualMinutes: 20,
        bestCapability: "classify",
        acceptableCapabilities: ["classify", "flag"],
        bestImpl: "llm",
        acceptableImpls: ["llm", "custom-app"],
        checkpointKind: "critical",
        rationale:
          "This is a legally-sensitive decision that affects whether a real person is employed — a human must own it, so it's a critical checkpoint. An LLM can reason over the nuance; a rules filter is too brittle for the edge cases.",
      },
      {
        name: "Set up the right system access for the role",
        painPoint:
          "IT manually works out which tools and folders the role needs and requests each one.",
        timeCost: "~30 min/hire",
        manualMinutes: 30,
        bestCapability: "classify",
        acceptableCapabilities: ["classify", "extract"],
        bestImpl: "rules",
        acceptableImpls: ["rules", "custom-app"],
        checkpointKind: "trap",
        rationale:
          "Role-to-access mapping is a fixed policy, so a rules-based filter is the right, cheap fit. It SOUNDS high-stakes — 'system access!' — but standard access is internal and instantly revocable, so gating it just slows every hire. It's a trap, not a critical step.",
      },
      {
        name: "Write the personalised welcome and first-week plan",
        painPoint:
          "Each manager writes a bespoke welcome note and schedule from scratch.",
        timeCost: "~25 min/hire",
        manualMinutes: 25,
        bestCapability: "draft",
        acceptableCapabilities: ["draft", "summarise"],
        bestImpl: "llm",
        acceptableImpls: ["llm"],
        checkpointKind: "safe",
        rationale:
          "Personalised first-pass writing is a natural LLM draft job; commissioning a custom application for it would be wasteful over-engineering. It's a reviewable draft, so no checkpoint is required.",
      },
      {
        name: "Catch missing or inconsistent onboarding info",
        painPoint:
          "Gaps in forms only surface on day one, when it's too late to fix smoothly.",
        timeCost: "~15 min/hire",
        manualMinutes: 15,
        bestCapability: "flag",
        acceptableCapabilities: ["flag", "classify"],
        bestImpl: "rules",
        acceptableImpls: ["rules", "llm"],
        checkpointKind: "safe",
        rationale:
          "A completeness check is a simple rules-based flag that routes gaps back for follow-up — low-stakes and reversible, so it can run unattended.",
      },
    ],
    explanation:
      "A strong redesign extracts document data (a custom build pays off at volume), uses an LLM to reason about right-to-work but keeps a human accountable for that legal call, maps access by simple rules, and lets an LLM draft the welcome. The temptation is to gate the access step because it sounds risky — but it's reversible and internal, so a checkpoint there only adds drag. The wins come from matching each bottleneck to the right capability AND the right build, not from automating or gating everything.",
  },

  "expense-review": {
    topic: "expense review",
    workflowName: "Expense review & reimbursement",
    brief: {
      senderName: "Marcus Bell",
      senderRole: "Finance Operations Manager",
      senderInitials: "MB",
      message:
        "Expense review is a slog — we eyeball every receipt, check each line against policy by hand, and chase employees over email. I want it fast, but it has to stay defensible: when money moves or we reject someone's claim, we need to stand behind it.",
    },
    goal: "Speed up review and payment while keeping every money-moving and employee-facing decision defensible.",
    volumePerMonth: 800,
    stages: [
      {
        name: "Read amounts and categories off receipts",
        painPoint:
          "Clerks manually type totals, dates and categories from photographed receipts into the system.",
        timeCost: "~6 min/claim",
        manualMinutes: 6,
        bestCapability: "extract",
        acceptableCapabilities: ["extract", "summarise"],
        bestImpl: "custom-app",
        acceptableImpls: ["custom-app", "llm"],
        checkpointKind: "safe",
        rationale:
          "High-volume receipt capture that integrates with finance systems is where a custom application is worth commissioning. It only populates an editable record, so it's reversible and needs no human gate.",
      },
      {
        name: "Check each claim against expense policy",
        painPoint:
          "Reviewers read every line and judge whether it complies with a long policy document.",
        timeCost: "~8 min/claim",
        manualMinutes: 8,
        bestCapability: "classify",
        acceptableCapabilities: ["classify", "flag"],
        bestImpl: "llm",
        acceptableImpls: ["llm", "custom-app"],
        checkpointKind: "safe",
        rationale:
          "Judging messy claims against a nuanced policy is a classic LLM classification job. The output is just a recommendation downstream, so it's reversible and doesn't itself need a checkpoint — the gate belongs on the step that acts on it.",
      },
      {
        name: "Approve compliant claims and release payment",
        painPoint:
          "Approved reimbursements are paid out to employees' accounts.",
        timeCost: "~3 min/claim",
        manualMinutes: 3,
        bestCapability: "classify",
        acceptableCapabilities: ["classify"],
        bestImpl: "rules",
        acceptableImpls: ["rules", "custom-app"],
        checkpointKind: "critical",
        rationale:
          "Once a claim is classified, the approve/pay decision is a simple threshold — but it MOVES MONEY that's hard to claw back, so a human must stay accountable. Critical checkpoint.",
      },
      {
        name: "Flag suspected duplicate or out-of-policy claims",
        painPoint:
          "Duplicates and odd claims slip through because no one systematically checks for them.",
        timeCost: "~4 min/claim",
        manualMinutes: 4,
        bestCapability: "flag",
        acceptableCapabilities: ["flag", "classify"],
        bestImpl: "rules",
        acceptableImpls: ["rules", "llm"],
        checkpointKind: "trap",
        rationale:
          "Flagging is just routing a claim to a human queue — internal and reversible. 'Suspected fraud' feels alarming, but the flag itself decides nothing, so a checkpoint here only adds drag. A trap.",
      },
      {
        name: "Write and send the query / rejection to the employee",
        painPoint:
          "Reviewers hand-write each email explaining why a claim was queried or rejected.",
        timeCost: "~5 min/claim",
        manualMinutes: 5,
        bestCapability: "draft",
        acceptableCapabilities: ["draft", "summarise"],
        bestImpl: "llm",
        acceptableImpls: ["llm"],
        checkpointKind: "critical",
        rationale:
          "An LLM drafts the explanation well, and a custom app would be over-engineering — but the message goes to a real person about their money and can't be unsent, so a human must review before it leaves. Critical checkpoint.",
      },
    ],
    explanation:
      "A strong redesign builds a custom extractor for receipts (volume justifies it), uses an LLM to classify claims against policy, then pays out and emails employees only behind a human checkpoint, because both move money or reach a person. The flag step is the trap: it sounds like fraud control, but a flag only routes to a queue and is fully reversible, so gating it wastes time. Speed comes from automating the reversible middle; defensibility comes from gating the two irreversible ends.",
  },
};

const DEFAULT_KEY = "hr-onboarding";

export function mockWorkflowRedesignScenario(
  scenarioKey: string,
): WorkflowRedesignScenario {
  const raw = BANK[scenarioKey] ?? BANK[DEFAULT_KEY];
  return withStageIds(raw, BANK[scenarioKey] ? scenarioKey : DEFAULT_KEY);
}

/** Deterministic stand-in for the Ideation synthesis (offline / mock path). */
export function mockIdeationSynthesis(
  scenario: WorkflowRedesignScenario,
  notes: string,
): string[] {
  const insights: string[] = [];
  const slow = [...scenario.stages].sort((a, b) =>
    b.timeCost.localeCompare(a.timeCost),
  )[0];
  if (slow) {
    insights.push(
      `Your biggest manual drag is "${slow.name}" — a strong candidate for a ${CAPABILITY_BY_KIND[slow.bestCapability].label.toLowerCase()} block to take the load off.`,
    );
  }
  const critical = scenario.stages.find((s) => s.checkpointKind === "critical");
  if (critical) {
    insights.push(
      `Watch where decisions become irreversible — e.g. "${critical.name}" — and keep a human in the loop there rather than fully automating it.`,
    );
  }
  const customApp = scenario.stages.find((s) => s.bestImpl === "custom-app");
  if (customApp) {
    insights.push(
      `Not every step needs the same tooling: a high-volume step like "${customApp.name}" can justify a custom build, while lighter steps are better served by an LLM or simple rules.`,
    );
  }
  if (notes) {
    insights.unshift(
      `You're on the right track focusing on where time is lost today — now match each bottleneck to the capability that fits it.`,
    );
  }
  return insights.slice(0, 4);
}

/**
 * Deterministic stand-in for the conversational Ideation chat (offline / mock).
 * Builds a short coaching reply that reacts to the player's latest message and a
 * refreshed list of takeaways distilled from everything they've said so far.
 */
export function mockIdeationChat(
  scenario: WorkflowRedesignScenario,
  messages: IdeationMessage[],
): IdeationChatResult {
  const userTurns = messages.filter((m) => m.role === "user");
  const latest = userTurns[userTurns.length - 1]?.content.trim() ?? "";
  const allNotes = userTurns.map((m) => m.content).join(" ");

  const slow = [...scenario.stages].sort(
    (a, b) => b.manualMinutes - a.manualMinutes,
  )[0];
  const critical = scenario.stages.find((s) => s.checkpointKind === "critical");

  let reply: string;
  if (!latest) {
    reply = `Let's think about ${scenario.workflowName}. Where do you feel the most time is lost today — and which steps are genuine judgement calls rather than mechanical ones?`;
  } else {
    const parts: string[] = [
      "Good — you're zeroing in on where the real drag is.",
    ];
    if (slow) {
      parts.push(
        `"${slow.name}" is the heaviest manual step here, so a ${CAPABILITY_BY_KIND[
          slow.bestCapability
        ].label.toLowerCase()} capability could take a lot of that load off.`,
      );
    }
    if (critical) {
      parts.push(
        `One to watch: "${critical.name}" reaches a real outcome, so think about keeping a human accountable there rather than fully automating it. What would you do with that step?`,
      );
    }
    reply = parts.join(" ");
  }

  return { reply, takeaways: mockIdeationSynthesis(scenario, allNotes) };
}

/** Deterministic stand-in for the Validate critique (offline / mock path). */
export function mockValidationCritique(
  scenario: WorkflowRedesignScenario,
  byId: Map<string, StageBuild>,
): ValidationCritique {
  const underpowered: string[] = [];
  const overEngineered: string[] = [];
  const goodFit: string[] = [];
  const missedCheckpoint: string[] = [];
  const overGated: string[] = [];

  for (const s of scenario.stages) {
    const b = byId.get(s.id);
    // technical: capability + impl fit
    if (b?.capability && s.acceptableCapabilities.includes(b.capability)) {
      if (b.impl === s.bestImpl) goodFit.push(s.name);
      else if (b.impl && !s.acceptableImpls.includes(b.impl)) {
        if (b.impl === "rules" && s.bestImpl !== "rules")
          underpowered.push(s.name);
        else if (b.impl === "custom-app" && s.bestImpl !== "custom-app")
          overEngineered.push(s.name);
        else underpowered.push(s.name);
      }
    }
    // governance
    if (s.checkpointKind === "critical" && !b?.checkpoint)
      missedCheckpoint.push(s.name);
    if (
      (s.checkpointKind === "trap" || s.checkpointKind === "safe") &&
      b?.checkpoint
    )
      overGated.push(s.name);
  }

  const technicalParts: string[] = [];
  if (goodFit.length)
    technicalParts.push(
      `${goodFit.length} stage${goodFit.length === 1 ? "" : "s"} are matched to the right capability and build.`,
    );
  if (underpowered.length)
    technicalParts.push(
      `${underpowered.join(", ")} ${underpowered.length === 1 ? "is" : "are"} under-powered — a rules filter will miss the nuance and let errors through.`,
    );
  if (overEngineered.length)
    technicalParts.push(
      `${overEngineered.join(", ")} ${overEngineered.length === 1 ? "is" : "are"} over-engineered — commissioning a custom application there is more cost than the step warrants.`,
    );
  if (!technicalParts.length)
    technicalParts.push(
      "The capability choices broadly fit, but tighten the implementation tiers to the volume and stakes of each step.",
    );

  const govParts: string[] = [];
  if (missedCheckpoint.length)
    govParts.push(
      `No human reviews ${missedCheckpoint.join(", ")} — an irreversible or person-affecting decision would run unchecked, which isn't defensible.`,
    );
  if (overGated.length)
    govParts.push(
      `You gated ${overGated.join(", ")}, which ${overGated.length === 1 ? "is" : "are"} reversible or internal — that just slows the workflow you set out to speed up.`,
    );
  if (!missedCheckpoint.length && !overGated.length)
    govParts.push(
      "Human review sits exactly where decisions become irreversible or reach a person, and nowhere it would only add drag — a defensible balance.",
    );

  const clean = !underpowered.length && !overEngineered.length && !missedCheckpoint.length && !overGated.length;
  const headline = clean
    ? `A production-ready redesign of ${scenario.workflowName}.`
    : missedCheckpoint.length
      ? `Fast, but ${scenario.workflowName} has a governance gap to close.`
      : `A promising redesign of ${scenario.workflowName} with a few rough edges.`;

  return {
    headline,
    technical: technicalParts.join(" "),
    governance: govParts.join(" "),
  };
}

/** Deterministic stand-in run-narration (offline / mock path) — consistent with `impact`. */
export function mockWorkflowRedesignOutcome(
  scenario: WorkflowRedesignScenario,
  impact: WorkflowImpact,
): string {
  const nameById = new Map(scenario.stages.map((s) => [s.id, s.name]));
  const find = (band: WorkflowImpact["stages"][number]["band"]) =>
    impact.stages.find((s) => s.band === band);

  const speed = `Once it went live, ${scenario.workflowName.toLowerCase()} dropped from ~${Math.round(
    impact.beforeMinutes,
  )} to ~${Math.round(impact.afterMinutes)} minutes an item — about ${Math.round(
    impact.pctFaster * 100,
  )}% faster, freeing roughly ${impact.hoursSavedPerMonth} human-hours a month across ${impact.volumePerMonth} items.`;

  const unaddressed = find("unaddressed");
  const exposed = find("hallucination-exposed");
  const underpowered = find("under-powered");
  const overBuilt = find("over-built");

  let quality: string;
  if (unaddressed) {
    quality = `But "${nameById.get(unaddressed.id)}" was never really redesigned, so a person is still doing it by hand and the queue backs up there.`;
  } else if (exposed) {
    quality = `The catch: "${nameById.get(exposed.id)}" let an AI make an irreversible, person-facing call with no human checking it — so the first hallucination reached someone before anyone noticed.`;
  } else if (underpowered) {
    quality = `The weak point was "${nameById.get(underpowered.id)}": a rules filter there missed the nuance and let errors through that a human later had to unpick.`;
  } else if (overBuilt) {
    quality = `It works, but "${nameById.get(overBuilt.id)}" was built heavier than it needed to be — paying custom-app costs for a job lighter tooling would have done.`;
  } else if (impact.overReviewed >= 2 || impact.pctFaster < 0.5) {
    quality = `Nothing unsafe slipped through, but you parked a human in front of ${impact.overReviewed} reversible step${
      impact.overReviewed === 1 ? "" : "s"
    }, handing back much of the speed the redesign was meant to buy.`;
  } else {
    quality = `Every risky moment was caught at a human checkpoint and the routine steps ran on their own — fast where it could be, guarded where it had to be.`;
  }

  return `${speed} ${quality}`;
}
