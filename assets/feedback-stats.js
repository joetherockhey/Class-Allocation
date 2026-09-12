/**
 * The four things we ask the audience, and how to turn a pile of responses
 * into the numbers the home page shows. No DOM in here, so it can be tested
 * from node: `npm test`.
 */
export const METRICS = [
  { key: "useful",    question: "Was it useful?",                    low: "Not really",    high: "Very useful" },
  { key: "clear",     question: "Was it easy to follow?",            low: "Hard to follow", high: "Very clear" },
  { key: "engaging",  question: "Did it hold your attention?",       low: "Not really",    high: "Definitely" },
  { key: "confident", question: "Do you feel better about teamwork?", low: "Not at all",    high: "A lot" },
];

/** The two pick-one questions. `v` is what goes in the database and is fixed
 *  by a check constraint (supabase/feedback-choices.sql); the labels are just
 *  wording and can change freely. */
export const CHOICES = [
  {
    key: "recommend",
    question: "Should other tutorials get this session?",
    options: [
      { v: "yes",   label: "Yes" },
      { v: "maybe", label: "Maybe" },
      { v: "no",    label: "No" },
    ],
  },
  {
    key: "best_bit",
    question: "What was the most useful part?",
    options: [
      { v: "examples",  label: "The examples and stories" },
      { v: "tips",      label: "The practical tips" },
      { v: "activity",  label: "The activity" },
      { v: "questions", label: "Being able to ask questions" },
      { v: "none",      label: "Honestly, not much" },
    ],
  },
];

export const GOOD = 7;   // 7 and over out of 10 is a thumbs up
export const BAD  = 4;   // under 4 is a thumbs down; the rest is in between

/** Counts and an average for one metric. Percentages are deliberately not
 *  precomputed for the bar - it is drawn from the counts, so three rounded
 *  shares can never add up to 101%. */
function metric(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return { answered: 0, good: 0, mixed: 0, bad: 0, average: null, goodPct: null };
  const good = vals.filter((v) => v >= GOOD).length;
  const bad  = vals.filter((v) => v <  BAD).length;
  return {
    answered: vals.length,
    good,
    bad,
    mixed: vals.length - good - bad,
    average: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    goodPct: Math.round((good / vals.length) * 100),
  };
}

/** How the pick-one answers fell. Anything not on the option list is ignored
 *  rather than shown - only the form writes here, and the database will not
 *  accept a value the constraint does not know. */
function choice(rows, q) {
  const counts = q.options.map((o) => ({ ...o, n: rows.filter((r) => r[q.key] === o.v).length }));
  return { answered: counts.reduce((a, c) => a + c.n, 0), counts };
}

/** Summarise every response for one tutorial. */
export function summarise(rows) {
  return {
    responses: rows.length,
    metrics: Object.fromEntries(METRICS.map((m) => [m.key, metric(rows, m.key)])),
    choices: Object.fromEntries(CHOICES.map((q) => [q.key, choice(rows, q)])),
    comments: rows
      .filter((r) => r.comment && r.comment.trim())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((r) => ({ comment: r.comment.trim(), created_at: r.created_at })),
  };
}

/** All responses grouped by tutorial id, each already summarised. */
export function byTutorial(rows) {
  const bins = new Map();
  for (const r of rows) {
    if (!bins.has(r.tutorial_id)) bins.set(r.tutorial_id, []);
    bins.get(r.tutorial_id).push(r);
  }
  return new Map([...bins].map(([id, rs]) => [id, summarise(rs)]));
}

/** One headline number for a whole tutorial: the mean of the metric averages
 *  it actually has, or null when nobody moved a slider. */
export function overall(summary) {
  const avgs = METRICS.map((m) => summary.metrics[m.key].average).filter((a) => a !== null);
  if (!avgs.length) return null;
  return Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10;
}
