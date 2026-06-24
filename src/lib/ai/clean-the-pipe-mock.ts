import {
  withSourceIds,
  type CleanThePipeScenario,
  type RawCleanThePipeScenario,
} from "./clean-the-pipe";

/**
 * Deterministic offline rounds — one per difficulty (1-5) — so "Clean the Pipe"
 * is fully playable with no AI provider configured. Difficulty escalates the
 * integration design: round 1 is a single "redirect the channel" call; the
 * middle rounds add the first migration and a four-way sort; round 4 is a desk
 * full of historical sources (two spreadsheets, a key-fields-missing database, an
 * inbox) each needing a migration decision; round 5 (boss) plants a tempting but
 * not-worth-it migration so the player must spend conversion effort only where it
 * pays off.
 *
 * Sources are NOT ordered by their answer, so position carries no signal. The
 * roster of senders is unique to this game.
 */
const BANK: Record<number, RawCleanThePipeScenario> = {
  // D1 — fix the channel: redirect a messy live inbox, keep the clean DB, drop noise.
  1: {
    topic: "support requests",
    stepName: "Route incoming IT support requests to the right team",
    brief: {
      senderName: "Priya Nadkarni",
      senderRole: "IT Service Desk Lead",
      senderInitials: "PN",
      message:
        "We want the AI to auto-route support requests, but it keeps mis-filing them. Have a look at where the requests actually come from and decide how each source should feed the router. Don't over-engineer it.",
    },
    goal: "Feed the router clean, structured requests going forward — without burning time on data that doesn't matter.",
    sources: [
      {
        type: "email",
        label: "support@ shared inbox",
        summary: "Free-text emails where staff describe IT problems in their own words.",
        preview: {
          messages: [
            {
              from: "marketing@firm.com",
              subject: "laptop thing",
              body: "Hiya — my laptop won't connect to the printer on 3rd floor, also Outlook is slow. Can someone help? Ta",
            },
            {
              from: "j.okafor@firm.com",
              subject: "URGENT!!!",
              body: "cant log in to the VPN at all, tried twice. need it for a client call at 2",
            },
            {
              from: "reception@firm.com",
              body: "The meeting room screen is frozen again 🙁",
            },
          ],
        },
        usedFor: "Each message becomes a ticket the router assigns to a team.",
        volume: 1800,
        ongoing: true,
        migrationEffortHours: 12,
        kind: "messy-ongoing-no-history",
        reason:
          "Free-text email is why the router misfires — there's no category, priority or system field to route on. The fix is to REDIRECT new requests through a structured form (dropdowns for category/priority); old resolved emails don't need re-routing.",
      },
      {
        type: "database",
        label: "Asset register (CMDB)",
        summary: "The configuration database of every device, owner and location.",
        preview: {
          columns: ["Asset ID", "Type", "Owner", "Location", "Status"],
          rows: [
            ["LT-4821", "Laptop", "J. Okafor", "Floor 2", "Active"],
            ["PR-0093", "Printer", "Shared", "Floor 3", "Active"],
            ["MR-0012", "Display", "Reception", "Ground", "Active"],
          ],
        },
        usedFor: "The router looks up the device an issue refers to.",
        volume: 3200,
        ongoing: true,
        migrationEffortHours: 20,
        kind: "clean-structured",
        reason:
          "Already a clean, structured system the router reads fine — keep feeding it in as-is. Touching it would be pure busywork.",
      },
      {
        type: "spreadsheet",
        label: "2019 desk-move plan (xlsx)",
        summary: "A one-off seating spreadsheet from a 2019 office move.",
        preview: {
          columns: ["Name", "Old desk", "New desk"],
          rows: [
            ["A. Smith", "2-14", "3-02"],
            ["B. Lee", "2-15", "3-03"],
          ],
        },
        usedFor: "Was attached to the project; nothing routes off it.",
        volume: 120,
        ongoing: false,
        migrationEffortHours: 6,
        kind: "irrelevant",
        reason:
          "A stale 2019 seating plan that has nothing to do with routing support tickets — exclude it; feeding it in just adds noise.",
      },
    ],
    explanation:
      "The router misfires because requests arrive as free-text email with no fields to route on — redirect that channel to a structured form and new tickets come in clean (no need to re-process old mail). The asset database is already structured, so keep it. The 2019 desk-move sheet is irrelevant, so drop it. Fixing the intake beats trying to clean every past message.",
  },

  // D2 — first migration: keep the clean DB, migrate the messy needed sheet, redirect the inbox.
  2: {
    topic: "expense reporting",
    stepName: "Total reimbursable expenses by category for the quarter",
    brief: {
      senderName: "Tomás Beckett",
      senderRole: "Finance Operations Analyst",
      senderInitials: "TB",
      message:
        "The category totals never tie out. The numbers come from three places — tell me how each should feed the tally so we can trust the figure. Some of it needs real work; some doesn't.",
    },
    goal: "Get every needed source into a shape the tally can total reliably, and don't reshape what's already fine.",
    sources: [
      {
        type: "database",
        label: "Corporate card feed (API)",
        summary: "A live feed of card transactions with merchant, amount and category.",
        preview: {
          columns: ["Date", "Merchant", "Amount", "Category"],
          rows: [
            ["02 Apr", "Trainline", "£142.00", "Travel"],
            ["05 Apr", "Pret", "£8.10", "Meals"],
            ["09 Apr", "Staples", "£54.99", "Office"],
          ],
        },
        usedFor: "The main stream of categorised spend the tally sums.",
        volume: 2600,
        ongoing: true,
        migrationEffortHours: 16,
        kind: "clean-structured",
        reason:
          "Clean, categorised, has amounts — exactly what the tally needs. Keep it as-is.",
      },
      {
        type: "spreadsheet",
        label: "Out-of-pocket claims (xlsx)",
        summary: "A manually-kept sheet of cash expenses staff file by hand.",
        preview: {
          columns: ["Who", "What", "Amount", "Category"],
          rows: [
            ["R. Patel", "Taxi to client", "23.40", ""],
            ["S. Ng", "Conference ticket", "£310", "training"],
            ["M. Cole", "lunch w/ supplier", "£18", ""],
          ],
        },
        usedFor: "Cash expenses that also belong in the category totals.",
        volume: 480,
        ongoing: true,
        migrationEffortHours: 10,
        kind: "messy-historical-needed",
        reason:
          "Real spend the tally needs, but blank/inconsistent categories and mixed amount formats mean it can't be totalled as-is — migrate it: normalise the amounts and fill the missing categories.",
      },
      {
        type: "email",
        label: "Receipts forwarded by email",
        summary: "Staff forward photos of receipts to an inbox as they go.",
        preview: {
          messages: [
            {
              from: "k.adeyemi@firm.com",
              subject: "Fwd: receipt",
              body: "Here's the taxi one from Tuesday [photo attached]",
            },
            {
              from: "l.zhang@firm.com",
              body: "another one, sorry the photo's blurry",
            },
          ],
        },
        usedFor: "An ad-hoc way expenses arrive that the tally can't read.",
        volume: 900,
        ongoing: true,
        migrationEffortHours: 14,
        kind: "messy-ongoing-no-history",
        reason:
          "Emailed photos can't be totalled and there's no structure to them — redirect to a structured expense-submission form going forward; the old forwarded photos aren't worth re-keying.",
      },
    ],
    explanation:
      "Three sources, three different calls. The card feed is already clean — keep it. The out-of-pocket sheet is spend you genuinely need but it's too messy to total, so migrate it. The emailed receipts are an unstructured channel best fixed by redirecting submissions to a form, not by re-keying old photos. Match the work to what each source actually needs.",
  },

  // D3 — sort the desk: one of each kind, four different right answers.
  3: {
    topic: "supplier management",
    stepName: "Build a current preferred-supplier list with up-to-date pricing",
    brief: {
      senderName: "Helena Vorster",
      senderRole: "Procurement Manager",
      senderInitials: "HV",
      message:
        "Four places hold supplier info and the AI's list is a mess. Decide how each should feed the build — keep, redesign, convert, or leave out. Read them before you choose.",
    },
    goal: "Compile the list from the sources that belong, each in a shape the build can use.",
    sources: [
      {
        type: "database",
        label: "Supplier master (ERP)",
        summary: "The system of record for approved suppliers and terms.",
        preview: {
          columns: ["Supplier", "Status", "Payment terms", "Category"],
          rows: [
            ["Northwind Ltd", "Approved", "30 days", "Packaging"],
            ["Acme Corp", "Approved", "45 days", "Raw materials"],
          ],
        },
        usedFor: "The backbone of approved suppliers and their terms.",
        volume: 1400,
        ongoing: true,
        migrationEffortHours: 18,
        kind: "clean-structured",
        reason:
          "The clean system of record — keep it; it's the spine of the list.",
      },
      {
        type: "spreadsheet",
        label: "Buyer price tracker (xlsx)",
        summary: "A spreadsheet buyers keep current prices in, by hand.",
        preview: {
          columns: ["Part", "Supplier", "Price", "Quoted"],
          rows: [
            ["Bolt M8", "North", "£0.42", "May 2026"],
            ["Washer", "", "0.08", ""],
            ["bolt m8", "East", "£0.45/unit", "28/04/26"],
          ],
        },
        usedFor: "The only place current per-part pricing lives.",
        volume: 650,
        ongoing: true,
        migrationEffortHours: 12,
        kind: "messy-historical-needed",
        reason:
          "Pricing the list needs, but with blank suppliers, mixed price formats and inconsistent dates — migrate it into a consistent shape so prices can be matched.",
      },
      {
        type: "email",
        label: "Quotes arriving by email",
        summary: "Suppliers email fresh quotes in free-text as they come.",
        preview: {
          messages: [
            {
              from: "sales@northwind.com",
              subject: "Re: bolt pricing",
              body: "Hi Helena, can do the M8 bolts at 0.41 each for orders over 10k. Cheers",
            },
            {
              from: "quotes@acme.com",
              body: "New washer price attached — 0.075/unit, valid 30 days.",
            },
          ],
        },
        usedFor: "How new prices reach the team.",
        volume: 520,
        ongoing: true,
        migrationEffortHours: 10,
        kind: "messy-ongoing-no-history",
        reason:
          "New quotes in free-text email can't be matched to parts reliably — redirect suppliers to a structured quote form; old emailed quotes are already captured in the tracker.",
      },
      {
        type: "spreadsheet",
        label: "2021 tender archive (xlsx)",
        summary: "Closed pricing from a one-off 2021 tender exercise.",
        preview: {
          columns: ["Supplier", "Bid", "Outcome"],
          rows: [
            ["Cedar Group", "£40,000", "Not selected"],
            ["Lumen Co", "£44,000", "Not selected"],
          ],
        },
        usedFor: "A historical record of a past tender.",
        volume: 90,
        ongoing: false,
        migrationEffortHours: 8,
        kind: "irrelevant",
        reason:
          "Stale, not-selected bids from a 2021 tender — they'd put wrong, outdated prices on a CURRENT list. Exclude.",
      },
    ],
    explanation:
      "Each source wants a different call: keep the ERP master (clean system of record), migrate the buyer price tracker (needed pricing, but messy), redirect the emailed quotes (fix the channel, don't re-key old mail), and exclude the 2021 tender archive (stale and out of scope). Reading what each one is — and what the build uses it for — is the whole skill.",
  },

  // D4 — migration day: two spreadsheets, a key-fields-missing DB, an inbox, plus the clean system.
  4: {
    topic: "customer onboarding",
    stepName: "Build one unified customer record for each client",
    brief: {
      senderName: "Marcus Ifeanyi",
      senderRole: "Head of Customer Operations",
      senderInitials: "MI",
      message:
        "We're consolidating customer data into one record per client. It's scattered across five sources in different shapes. Choose a migration path for each so the AI can build clean unified records — and be honest about what's actually needed.",
    },
    goal: "Bring every needed source into a consistent shape the build can merge, and don't reshape what's already clean.",
    sources: [
      {
        type: "spreadsheet",
        label: "Sales contacts (xlsx)",
        summary: "The sales team's own spreadsheet of client contacts.",
        preview: {
          columns: ["Company", "Contact", "Email", "Phone"],
          rows: [
            ["Beacon Health", "Dana W", "dana@beacon", "—"],
            ["Orbit Media", "", "info@orbit.co", "0207..."],
            ["beacon health ltd", "D. White", "", "+44 20 7..."],
          ],
        },
        usedFor: "Contact details that feed each unified record.",
        volume: 1200,
        ongoing: true,
        migrationEffortHours: 14,
        kind: "messy-historical-needed",
        reason:
          "Needed contact data, but with duplicate company spellings, blank fields and inconsistent phone formats — migrate it: de-duplicate and normalise before merging.",
      },
      {
        type: "spreadsheet",
        label: "Billing accounts (csv)",
        summary: "An export of billing accounts in mixed currencies.",
        preview: {
          columns: ["Account", "Plan", "MRR", "Currency"],
          rows: [
            ["Beacon Health", "Pro", "1,200", "GBP"],
            ["Orbit Media", "Team", "1.500,00", "EUR"],
            ["Northstar", "Pro", "$2000", ""],
          ],
        },
        usedFor: "The revenue figures attached to each unified record.",
        volume: 1100,
        ongoing: true,
        migrationEffortHours: 16,
        kind: "messy-historical-needed",
        reason:
          "Revenue the record needs, but mixed currencies, decimal formats and a blank currency mean totals would be nonsense as-is — migrate it: convert to one currency and a single number format.",
      },
      {
        type: "database",
        label: "Legacy CRM (key fields blank)",
        summary: "An old CRM where the account-owner and tier fields were rarely filled.",
        preview: {
          columns: ["Company", "Account owner", "Tier", "Since"],
          rows: [
            ["Beacon Health", "", "", "2019"],
            ["Orbit Media", "K. Adeyemi", "", "2021"],
            ["Northstar", "", "", "2018"],
          ],
        },
        usedFor: "Account ownership and tier for each unified record.",
        volume: 1600,
        ongoing: false,
        migrationEffortHours: 24,
        kind: "unusable-type-needed",
        reason:
          "The record needs owner and tier, but those key fields are mostly blank — the data has to be backfilled (from sign-up history and assignments) before it's usable. Migrate it.",
      },
      {
        type: "email",
        label: "New-client intake emails",
        summary: "Account managers email new client details in free-text.",
        preview: {
          messages: [
            {
              from: "am1@firm.com",
              subject: "new client",
              body: "Just signed Vertex Labs — main contact is Sam (sam@vertex.io), they're on the Team plan I think",
            },
            {
              from: "am2@firm.com",
              body: "Onboarded Cyan Group, will send billing later",
            },
          ],
        },
        usedFor: "How brand-new clients first get captured.",
        volume: 400,
        ongoing: true,
        migrationEffortHours: 8,
        kind: "messy-ongoing-no-history",
        reason:
          "New clients captured as free-text email arrive incomplete and inconsistent — redirect intake to a structured new-client form so future records start clean; the few old emails aren't worth re-keying.",
      },
      {
        type: "api",
        label: "Support desk (Zendesk API)",
        summary: "A live, well-structured feed of support tickets per account.",
        preview: {
          columns: ["Account", "Open tickets", "CSAT", "Last contact"],
          rows: [
            ["Beacon Health", "2", "4.6", "12 Jun"],
            ["Orbit Media", "0", "4.9", "03 Jun"],
          ],
        },
        usedFor: "Support health attached to each unified record.",
        volume: 2000,
        ongoing: true,
        migrationEffortHours: 20,
        kind: "clean-structured",
        reason:
          "A clean, structured API the build can read directly — keep it; migrating it would waste effort for no gain.",
      },
    ],
    explanation:
      "Four of the five sources need work and one doesn't. Migrate the two messy spreadsheets (de-dupe contacts; normalise currencies) and the legacy CRM (backfill the blank owner/tier fields) — they're all needed and unusable as-is. Redirect the free-text intake emails to a structured form rather than re-keying them. Keep the clean support API untouched. Choosing the migration path per source is the job.",
  },

  // D5 — boss: a needed migration, a needed conversion, the not-worth-it trap, a redirect, a keep.
  5: {
    topic: "regulatory reporting",
    stepName: "Compile the annual compliance report from source records",
    brief: {
      senderName: "Dana Whitlock",
      senderRole: "Head of Compliance",
      senderInitials: "DW",
      message:
        "Annual report time. Five sources feed it and they're all in different states. Be careful what you migrate — one of these is a huge job for almost no benefit. Spend the effort where it actually changes the report.",
    },
    goal: "Get the sources the report depends on into shape, and leave the migration that doesn't earn its cost.",
    sources: [
      {
        type: "spreadsheet",
        label: "Incident log (xlsx)",
        summary: "The log of reportable incidents, kept by hand across the year.",
        preview: {
          columns: ["Date", "Type", "Severity", "Resolved"],
          rows: [
            ["14/03", "Data", "High", "Y"],
            ["2 May", "access", "", "yes"],
            ["07-08-26", "Data Breach", "high", ""],
          ],
        },
        usedFor: "The core list of incidents the report must account for.",
        volume: 320,
        ongoing: true,
        migrationEffortHours: 12,
        kind: "messy-historical-needed",
        reason:
          "The report's backbone, but with inconsistent dates, blank severities and varied wording — migrate it into a consistent schema or the incident counts will be wrong.",
      },
      {
        type: "scans",
        label: "Signed attestation forms (PDF scans)",
        summary: "Scanned, signed manager attestations the report must evidence.",
        preview: {
          note: "≈900 scanned PDFs of signed paper forms. No text layer — the AI can't read names, dates or the attestation field without OCR and extraction. The report has to cite these.",
        },
        usedFor: "Evidence that each manager signed off, cited in the report.",
        volume: 900,
        ongoing: false,
        migrationEffortHours: 30,
        kind: "unusable-type-needed",
        reason:
          "The report is legally required to evidence these sign-offs, but as image-only scans they're unreadable — migrate them: OCR and extract the key fields. Costly, but the report can't be filed without them.",
      },
      {
        type: "scans",
        label: "Historic training certificates (2015–2019)",
        summary: "Scanned PDFs of old staff training certificates.",
        preview: {
          note: "Thousands of scanned certificates from 2015–2019. This year's report only covers the current period, and current training is already tracked in the LMS below. Digitising these would be a large OCR project.",
        },
        usedFor: "Old training evidence from prior periods.",
        volume: 4000,
        ongoing: false,
        migrationEffortHours: 60,
        kind: "unusable-not-worth",
        reason:
          "A tempting 60-hour OCR migration — but these are out-of-period and current training is already in the LMS, so the report doesn't need them. Exclude; migrating them burns effort and introduces errors for no benefit. This is the trap.",
      },
      {
        type: "email",
        label: "Breach notifications by email",
        summary: "Teams email breach notifications in free-text as they happen.",
        preview: {
          messages: [
            {
              from: "secops@firm.com",
              subject: "possible breach",
              body: "Saw unusual access on the finance share around 3pm, looking into it now",
            },
            {
              from: "it@firm.com",
              body: "false alarm on yesterday's one, was a sync job",
            },
          ],
        },
        usedFor: "How breaches first get reported internally.",
        volume: 260,
        ongoing: true,
        migrationEffortHours: 8,
        kind: "messy-ongoing-no-history",
        reason:
          "Free-text breach emails are inconsistent and hard to count — redirect to a structured incident-report form so future notifications are captured cleanly; old threads are already reflected in the incident log.",
      },
      {
        type: "database",
        label: "Learning system (LMS)",
        summary: "The current training system with completion records per employee.",
        preview: {
          columns: ["Employee", "Course", "Completed", "Status"],
          rows: [
            ["A. Smith", "Data Protection", "2026-02-10", "Complete"],
            ["B. Lee", "Security Basics", "2026-01-22", "Complete"],
          ],
        },
        usedFor: "Current-period training completion the report draws on.",
        volume: 5000,
        ongoing: true,
        migrationEffortHours: 20,
        kind: "clean-structured",
        reason:
          "A clean, current system the report reads directly — keep it; it already covers this period's training.",
      },
    ],
    explanation:
      "Migrate the incident log (the report's backbone, but messy) and OCR the signed attestation scans (legally required evidence, unreadable as images). Redirect the free-text breach emails to a structured form. Keep the clean LMS. The trap is the 2015–2019 training certificates: a huge 60-hour OCR job that's out of period and already superseded by the LMS — excluding it is the calibrated call. Spend migration effort only where it changes the report.",
  },
};

export function mockCleanThePipeRound(difficulty: number): CleanThePipeScenario {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return withSourceIds(BANK[d], d);
}
