// Narration scripts for each game's video explainer.
//
// These are placeholder scripts shown (as subtle text behind the play icon) in
// each game's "how to play" modal until the real explainer videos are produced.
// Each script teaches the *concept* the game practises — never the game itself —
// and ends on a leading sentence that hands the player into the round.
//
// Keyed by game slug (matching src/lib/db/seed.ts).

export const EXPLAINER_SCRIPTS: Record<string, string> = {
  // Prompt Golf — Prompting
  "prompt-golf":
    "A prompt is the instruction you give an AI — and how you phrase it shapes " +
    "everything you get back. Because the AI only has your words to work from, it " +
    "fills any gap you leave with its own guess — so vagueness gets you a vague " +
    "answer. A tight prompt tells it exactly what to do, what to include, and what " +
    "to leave out. The goal isn't to say more; it's to say precisely what matters. " +
    "Every word earns its place, and the clearest instruction beats the longest one " +
    "every time. Let's see what that looks like in practice.",

  // Spot the Hallucination — Hallucinations
  hallucination:
    "AI doesn't \"know\" facts — it predicts the most plausible-sounding next words. " +
    "That's exactly why hallucinations happen: when it has no real answer, it " +
    "generates what sounds right rather than admitting the gap, inventing a " +
    "statistic, citation, or name that doesn't exist. And the danger is it reads " +
    "just as smoothly as the real thing. The lesson: treat fluent, confident output " +
    "as a draft to verify, not an answer to trust. Let's see if you can spot one.",

  // Think It Through — Reasoning
  "chain-of-thought":
    "Early AI gave you an answer the instant you asked — it just blurted out " +
    "whatever sounded right, with no working shown. Reasoning changed that: instead " +
    "of jumping straight to an answer, the AI breaks a problem into steps and " +
    "follows the logic through, which is what lets it handle multi-step work that " +
    "used to trip it up. That matters because confidence isn't correctness — a snap " +
    "answer can sound certain and still be wrong, while reasoning lets you see how " +
    "it got there. The skill is knowing when a quick answer is enough and when the " +
    "working is worth demanding — and staying accountable for the final call. Let's " +
    "see what that looks like in practice.",

  // Context Calibration — Context
  "context-calibration":
    "Context is the background information you hand the AI along with your request. " +
    "It matters because the AI weighs everything you give it when shaping its " +
    "answer — so the right context grounds the response, while irrelevant or " +
    "misleading material actively pulls it off course. The skill is calibration: " +
    "give it what the task genuinely needs, leave out the noise, and watch for " +
    "plausible-looking details that quietly derail the result. Too little starves " +
    "the answer; too much misdirects it. Let's see what that looks like in practice.",

  // Trace the Flow — Seeing work as a system of steps
  "trace-the-flow":
    "Every job, however messy it feels, is really a chain of discrete steps — each " +
    "one taking something in and handing something out. It's worth seeing because " +
    "you can't improve, automate, or redesign work you can't first describe: the " +
    "shape stays invisible until you break it into named steps and the data flowing " +
    "between them. And the most expensive problems hide in the hand-offs — the " +
    "moment one step's output doesn't quite match what the next step needs, " +
    "information quietly leaks. The skill is learning to see the chain: the steps, " +
    "their order, and where a link is broken. Let's see what that looks like in " +
    "practice.",

  // Clean the Pipe — Data hygiene / garbage-in, garbage-out
  "clean-the-pipe":
    "An AI is only ever as good as what you feed it — give it messy input and you " +
    "get a confident, useless answer out. That's because the model can't tell a " +
    "stale record or a wrong-category entry from a good one; it treats whatever you " +
    "hand it as true and builds on it, so a single poisoned row can skew the whole " +
    "result. But not all mess matters equally — a harmless duplicate changes " +
    "nothing, while one bad value derails everything. The skill is triage: spot the " +
    "dirt that actually changes the output, and don't waste effort scrubbing what " +
    "doesn't. Let's see what that looks like in practice.",

  // Fit for Purpose — Matching the tool to the work
  "right-tool-for-the-job":
    "Not every task deserves the same tool — and reaching for the most powerful one " +
    "is often the wrong move. The trick is that the right intervention depends on " +
    "the step itself: how often it runs, how much each slip costs, how messy the " +
    "input is. A fancy custom build can be pure waste on a job you do twice a year, " +
    "while leaving a thousand-times-a-day task to a human quietly bleeds cost all " +
    "year. The skill is matching the tool to the work — rules, AI, a custom app, or " +
    "simply leaving it alone — by weighing what it costs to act against the cost of " +
    "doing nothing. Let's see what that looks like in practice.",

  // In the Loop — Human-in-the-Loop
  "checkpoint-placement":
    "When you let AI run a process on its own, the question becomes: where does a " +
    "human need to step in? A checkpoint is a moment where a person reviews before " +
    "things continue — and its value is that it catches a confident mistake before " +
    "it becomes a real-world consequence. Too few, and errors sail straight " +
    "through. Too many, and you've thrown away the speed that made automation worth " +
    "it. The skill is placing oversight where the risk actually lives — light touch " +
    "on low-stakes steps, firm control where decisions affect people. Let's see " +
    "what that looks like in practice.",

  // Workflow Redesign Challenge — Redesigning work
  "workflow-redesign":
    "Most people use AI to do the same old tasks a bit faster. The real leap is " +
    "redesigning the work itself around what AI is good at, because a process built " +
    "for humans rarely matches how AI works best — the biggest gains come from " +
    "rethinking the shape of the work, not just its speed. Instead of asking \"how " +
    "do I speed up this step?\", you ask \"should this process even look like this " +
    "anymore?\" That means spotting the bottlenecks, choosing the right tool for " +
    "each piece, and knowing when to call in specialists to build something custom. " +
    "Let's see what that looks like in practice.",
};
