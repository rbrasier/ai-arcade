import {
  withItemIds,
  type CleanThePipeScenario,
  type RawCleanThePipeScenario,
} from "./clean-the-pipe";

/**
 * Deterministic offline rounds — one per difficulty (1-5) — so "Clean the Pipe"
 * is fully playable with no AI provider configured. Difficulty scales the dirt:
 * warm-up has one obvious bad row; the middle rounds bury a consequential row
 * among tempting-but-harmless dirt; rounds 4-5 add "batch" items — whole sources
 * whose data type doesn't suit the system, where a repair is a migration that
 * costs real hours (one worth-it batch in round 4, a worth-it and a tolerable
 * one in round 5).
 *
 * Items are NOT ordered by their action, so position carries no signal — the
 * player has to read each one. The roster of senders is unique to this game.
 */
const BANK: Record<number, RawCleanThePipeScenario> = {
  // D1 (warm-up) — one wrong-category row among clean survey responses.
  1: {
    topic: "training feedback",
    stepName: "Summarise the course feedback into themes",
    datasetName: "Workshop feedback responses",
    brief: {
      senderName: "Priya Nadkarni",
      senderRole: "Learning & Development Lead",
      senderInitials: "PN",
      message:
        "Here are the responses from last week's workshop. Before I have the AI theme them, can you cast an eye over the rows and clear anything that would throw the summary off? Don't fuss over little stuff.",
    },
    goal: "Remove what would skew the themes, and leave the genuinely fine responses untouched.",
    items: [
      {
        kind: "record",
        label: "Row 1 · attendee A",
        content: '"The hands-on exercises were the most useful part."',
        usedFor: "Becomes one data point in the themed summary of feedback.",
        consequential: false,
        correctAction: "pass",
        reason: "A clean, on-topic response — exactly what the summary needs.",
      },
      {
        kind: "record",
        label: "Row 2 · attendee B",
        content: '"Pace was a little fast but the examples landed well."',
        usedFor: "Feeds the themes about pace and delivery.",
        consequential: false,
        correctAction: "pass",
        reason: "On-topic feedback; nothing to fix.",
      },
      {
        kind: "record",
        label: "Row 3 · facilities ticket",
        content: '"The projector in Room 4 needs a new bulb — logged with IT."',
        usedFor: "Would be read as a feedback response and grouped into a theme.",
        consequential: true,
        correctAction: "bin",
        reason:
          "This isn't course feedback at all — a facilities note slipped into the export. Left in, it invents a fake 'equipment' theme.",
      },
      {
        kind: "record",
        label: "Row 4 · attendee C",
        content: '"More time for Q&A next time, please."',
        usedFor: "Contributes to themes about session structure.",
        consequential: false,
        correctAction: "pass",
        reason: "Genuine feedback; keep it.",
      },
      {
        kind: "record",
        label: "Row 5 · attendee D",
        content: '"Loved the templates we got to take away."',
        usedFor: "Feeds themes about materials and takeaways.",
        consequential: false,
        correctAction: "pass",
        reason: "On-topic; keep it.",
      },
    ],
    explanation:
      "Only the facilities ticket needed clearing — it isn't feedback, so it would have spawned a bogus theme. Everything else is clean, on-topic feedback; touching it would just be busywork. Not all rows that look 'odd' are worth acting on — only the ones that change the result.",
  },

  // D2 (duplicates & blanks) — lots of cosmetic dirt, one blank that matters.
  2: {
    topic: "expense claims",
    stepName: "Total this month's reimbursable expenses by category",
    datasetName: "March expense export",
    brief: {
      senderName: "Tomás Beckett",
      senderRole: "Finance Operations Analyst",
      senderInitials: "TB",
      message:
        "Month-end expense export, straight from the portal. Tidy up anything that would throw the category totals before I run the tally. It's a bit messy — but not all of it matters.",
    },
    goal: "Fix what corrupts the totals, and resist cleaning the cosmetic mess that doesn't.",
    items: [
      {
        kind: "record",
        label: "Row 7 · Travel",
        content: "£142.00 — train, client visit (Travel)",
        usedFor: "Adds £142 to the Travel category total.",
        consequential: false,
        correctAction: "pass",
        reason: "Clean, categorised, has an amount. Keep it.",
      },
      {
        kind: "record",
        label: "Row 8 · Travel (dup)",
        content: "£142.00 — train, client visit (Travel)  [exact duplicate of Row 7]",
        usedFor: "Would add a second £142 to the Travel total.",
        consequential: true,
        correctAction: "bin",
        reason:
          "An exact duplicate of a real claim — left in, it double-counts £142 in the Travel total. This duplicate actually matters.",
      },
      {
        kind: "record",
        label: "Row 11 · Meals",
        content: "£23.40 — team lunch (Meals)   note: receipt photo blurry",
        usedFor: "Adds £23.40 to the Meals total.",
        consequential: false,
        correctAction: "pass",
        reason:
          "The 'blurry receipt' note is cosmetic — the amount and category are present, so the tally is fine. Leave it.",
      },
      {
        kind: "record",
        label: "Row 12 · (blank category)",
        content: "£310.00 — conference ticket, category: ____",
        usedFor: "The tally groups by category — this £310 needs one to land anywhere.",
        repairedContent: "£310.00 — conference ticket (Training)",
        consequential: true,
        correctAction: "repair",
        reason:
          "A real £310 claim with no category — the tally needs the category, so this is a recoverable gap: repair it (it's clearly a conference/Training cost).",
      },
      {
        kind: "record",
        label: "Row 15 · Meals",
        content: "£8.10 — coffee (meals)",
        usedFor: "Adds £8.10 to the Meals total.",
        consequential: false,
        correctAction: "pass",
        reason:
          "Lower-case 'meals' vs 'Meals' is a cosmetic inconsistency the tally ignores. Don't bother.",
      },
      {
        kind: "record",
        label: "Row 16 · Office",
        content: "£54.99 — printer paper (Office)",
        usedFor: "Adds £54.99 to the Office total.",
        consequential: false,
        correctAction: "pass",
        reason: "Clean and categorised. Keep it.",
      },
    ],
    explanation:
      "Two rows actually move the totals: the exact duplicate (bin it, or you double-count) and the £310 claim with no category (repair it, or it falls out of every category). The blurry-receipt note and the lower-case 'meals' look untidy but the tally doesn't care — chasing them is wasted effort. Match the cleaning to what changes the number.",
  },

  // D3 (stale record) — an out-of-date row flips the result; tempting dirt around it.
  3: {
    topic: "supplier pricing",
    stepName: "Find the current lowest price for each part",
    datasetName: "Supplier quote sheet",
    brief: {
      senderName: "Helena Vorster",
      senderRole: "Procurement Manager",
      senderInitials: "HV",
      message:
        "Quotes for the reorder. Have a look before the AI picks the cheapest per part — something in here will give us a wrong answer if it stays. Some of it's just untidy, mind.",
    },
    goal: "Bin the entry that would produce a wrong 'lowest price', without over-pruning the rest.",
    items: [
      {
        kind: "record",
        label: "Part A · Supplier North",
        content: "Bolt M8 — £0.42/unit — quoted 2 May 2026",
        usedFor: "A candidate price when picking the cheapest Bolt M8.",
        consequential: false,
        correctAction: "pass",
        reason: "Current quote, in date. Keep it.",
      },
      {
        kind: "record",
        label: "Part A · Supplier West",
        content: "Bolt M8 — £0.19/unit — quoted 12 Nov 2019  [expired]",
        usedFor: "Would compete to be the lowest Bolt M8 price.",
        consequential: true,
        correctAction: "bin",
        reason:
          "A 2019 price that's no longer honoured — but it's the lowest number on the sheet, so left in it wins as 'cheapest' and gives a wrong answer. Bin it.",
      },
      {
        kind: "record",
        label: "Part A · Supplier East",
        content: "bolt m8 — £0.45/unit — quoted 28 Apr 2026",
        usedFor: "A candidate price for the cheapest Bolt M8.",
        consequential: false,
        correctAction: "pass",
        reason:
          "Lower-case spelling is cosmetic; the price is current and valid. Leave it.",
      },
      {
        kind: "record",
        label: "Part B · Supplier North",
        content: "Washer — £0.08/unit — quoted 2 May 2026",
        usedFor: "A candidate price for the cheapest Washer.",
        consequential: false,
        correctAction: "pass",
        reason: "Clean, current quote. Keep it.",
      },
      {
        kind: "record",
        label: "Part B · Supplier West",
        content: "Washer — £0.08/unit — quoted 2 May 2026   (re-sent email)",
        usedFor: "A candidate price for the cheapest Washer.",
        consequential: false,
        correctAction: "pass",
        reason:
          "The '(re-sent email)' aside is noise — same valid price. Don't act on it.",
      },
      {
        kind: "record",
        label: "Part B · Supplier South",
        content: "Washer — £0.11/unit — quoted 30 Apr 2026",
        usedFor: "A candidate price for the cheapest Washer.",
        consequential: false,
        correctAction: "pass",
        reason: "A current, valid quote. Keep it.",
      },
    ],
    explanation:
      "The 2019 expired quote is the one that matters: it's the lowest figure on the sheet, so it would be picked as 'cheapest' even though no one will honour it — bin it. The lower-case spelling and the 're-sent email' aside are cosmetic; they don't change which price is lowest, so leave them. The skill is spotting the dirt that flips the answer, not tidying everything.",
  },

  // D4 (a batch that doesn't fit) — records + ONE worth-migrating batch.
  4: {
    topic: "customer complaints",
    stepName: "Summarise this quarter's complaints into themes",
    datasetName: "Q2 complaint records",
    brief: {
      senderName: "Marcus Ifeanyi",
      senderRole: "Customer Insights Manager",
      senderInitials: "MI",
      message:
        "Two things going into the theme summary: the complaint log, and the call-centre's recordings. Sort out the log rows that would skew it — and decide what to do about the recordings, because they're not in a shape the summariser can read.",
    },
    goal: "Clean the rows that matter and bring the ill-fitting source into a usable shape — only if it's worth the effort.",
    items: [
      {
        kind: "record",
        label: "Row 3",
        content: '"Delivery was three days late and no one updated me."',
        usedFor: "A complaint that feeds the delivery theme.",
        consequential: false,
        correctAction: "pass",
        reason: "A clear, on-topic complaint. Keep it.",
      },
      {
        kind: "record",
        label: "Row 4 · praise",
        content: '"Honestly great service, just wanted to say thanks!"',
        usedFor: "Would be read as a complaint and grouped into a theme.",
        consequential: true,
        correctAction: "bin",
        reason:
          "This is praise, not a complaint — left in the complaint themes, it invents a positive 'theme' that misrepresents the quarter. Bin it.",
      },
      {
        kind: "record",
        label: "Row 9",
        content: '"App kept crashing at checkout."   (duplicate wording, diff. timestamp)',
        usedFor: "Adds weight to the checkout-crash theme.",
        consequential: false,
        correctAction: "pass",
        reason:
          "Two customers reporting the same crash is real signal, not a dirty duplicate. Keep it.",
      },
      {
        kind: "record",
        label: "Row 12 · garbled",
        content: '"#REF! — billing — ‚Äî charged twice"',
        usedFor: "Would feed the billing theme — if it can be read.",
        repairedContent: '"Billing — charged twice for one order."',
        consequential: true,
        correctAction: "repair",
        reason:
          "A genuine 'charged twice' billing complaint mangled by an encoding error — recoverable, and billing is a real theme, so repair it rather than lose it.",
      },
      {
        kind: "record",
        label: "Row 14",
        content: '"Staff member on the phone was very rude."',
        usedFor: "A complaint that feeds the service theme.",
        consequential: false,
        correctAction: "pass",
        reason: "A clean complaint about service. Keep it.",
      },
      {
        kind: "batch",
        label: "Call-centre audio recordings (Q2)",
        content:
          "Hundreds of .mp3 voice recordings — the summariser only reads text, so as-is the entire phone channel is invisible to the themes.",
        usedFor: "Would add the whole phone channel to the themed summary.",
        repairedContent: "Recordings transcribed to text the summariser can read.",
        migrationEffort: 10,
        consequential: true,
        correctAction: "repair",
        reason:
          "Phone is a major complaint channel; leaving the audio out would miss a whole slice of the quarter. Transcribing it to text (≈10 hrs) is worth it — the themes are badly skewed without it.",
      },
    ],
    explanation:
      "Two rows matter — the praise (bin: it isn't a complaint) and the garbled billing entry (repair: recoverable real signal). The duplicate-looking crash reports are genuine repeat signal, so keep them. The audio recordings don't fit the text summariser at all, and phone is a big channel — so repairing them (transcribe to text) is effort well spent. A batch repair costs real hours, but here the output is broken without it.",
  },

  // D5 (boss) — records + TWO batches: one worth migrating, one tolerable to leave.
  5: {
    topic: "sales pipeline",
    stepName: "Compile a Q3 revenue-forecast brief from these sources",
    datasetName: "Q3 forecasting inputs",
    brief: {
      senderName: "Dana Whitlock",
      senderRole: "Revenue Operations Director",
      senderInitials: "DW",
      message:
        "Pulling the Q3 forecast brief together. There are a few deal rows to sanity-check, plus two extra sources that don't slot neatly into the model. Be careful what you spend time migrating — not everything earns its keep.",
    },
    goal: "Clean the rows that distort the forecast and migrate only the source whose effort actually pays off.",
    items: [
      {
        kind: "record",
        label: "Deal 102 · Closed-Won",
        content: "Acme Corp — £48,000 — Closed-Won — Q3",
        usedFor: "Counts toward the Q3 closed-revenue forecast.",
        consequential: false,
        correctAction: "pass",
        reason: "A clean, in-period, closed deal. Keep it.",
      },
      {
        kind: "record",
        label: "Deal 104 · test",
        content: "TEST ACCOUNT — £999,999 — Closed-Won — Q3",
        usedFor: "Would be summed into the Q3 forecast total.",
        consequential: true,
        correctAction: "bin",
        reason:
          "A test record with a junk £999,999 value — left in, it blows the forecast wide open. Bin it.",
      },
      {
        kind: "record",
        label: "Deal 108",
        content: "Northwind Ltd — £31,500 — Closed-Won — Q3   (note: contact left company)",
        usedFor: "Counts toward the Q3 closed-revenue forecast.",
        consequential: false,
        correctAction: "pass",
        reason:
          "The 'contact left' aside doesn't change the closed value — cosmetic. Keep the deal.",
      },
      {
        kind: "record",
        label: "Deal 111 · stage blank",
        content: "Beacon Health — £62,000 — stage: ____ — Q3",
        usedFor: "The forecast weights deals by pipeline stage.",
        repairedContent: "Beacon Health — £62,000 — Closed-Won — Q3",
        consequential: true,
        correctAction: "repair",
        reason:
          "A real £62k deal with no pipeline stage — the forecast weights by stage, so this is a recoverable gap to repair, not bin.",
      },
      {
        kind: "record",
        label: "Deal 117 · last year",
        content: "Cedar Group — £40,000 — Closed-Won — Q3 LAST YEAR",
        usedFor: "Would be summed into this quarter's forecast.",
        consequential: true,
        correctAction: "bin",
        reason:
          "A prior-year deal that's wandered into the Q3 set — it inflates this quarter's forecast. Bin it.",
      },
      {
        kind: "record",
        label: "Deal 120 · Closed-Won",
        content: "Lumen Co — £27,250 — Closed-Won — Q3",
        usedFor: "Counts toward the Q3 closed-revenue forecast.",
        consequential: false,
        correctAction: "pass",
        reason: "Clean, in-period deal. Keep it.",
      },
      {
        kind: "batch",
        label: "Regional CRM export (LATAM team)",
        content:
          "A spreadsheet from a different CRM — amounts are in mixed local currencies and the stage names don't match our model, so dropped in as-is it corrupts both the totals and the stage weighting.",
        usedFor: "Would add the LATAM team's live Q3 pipeline to the forecast.",
        repairedContent: "Currencies converted to GBP and stage names mapped to our model.",
        migrationEffort: 8,
        consequential: true,
        correctAction: "repair",
        reason:
          "This is real Q3 pipeline that belongs in the forecast — converting the currencies and mapping the stages (≈8 hrs) is worth it; without it the regional numbers are wrong or missing.",
      },
      {
        kind: "batch",
        label: "Scanned PDF contracts archive (2018-2021)",
        content:
          "Thousands of scanned, unsearchable PDF contracts — the model can't read them without OCR and manual extraction.",
        usedFor: "Historic closed contracts; the forward forecast doesn't draw on them.",
        repairedContent: "OCR'd and key terms extracted into structured rows.",
        migrationEffort: 40,
        consequential: false,
        correctAction: "pass",
        reason:
          "Historic, already-closed contracts that the forward forecast doesn't need — a 40-hour OCR migration that buys the brief almost nothing. Leave it; this is the trap.",
      },
    ],
    explanation:
      "Three rows distort the forecast: the test account and the prior-year deal (bin) and the stage-less £62k deal (repair). The 'contact left' note and the repeat structure are harmless. On the batches, the LATAM CRM export is live Q3 pipeline in the wrong shape — repairing it (≈8 hrs) pays off. The scanned 2018-2021 contracts are a tempting 40-hour migration that the forward forecast doesn't need: leaving them is the calibrated call. Spend migration effort only where it changes the answer.",
  },
};

export function mockCleanThePipeRound(difficulty: number): CleanThePipeScenario {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return withItemIds(BANK[d], d);
}
