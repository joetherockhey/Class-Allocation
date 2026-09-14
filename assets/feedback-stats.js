/**
 * The five things we ask the audience, and how to turn a pile of responses
 * into the numbers the home page shows. No DOM in here, so it can be tested
 * from node: `npm test`.
 *
 * Every question is pick-one. `v` is what goes in the database and is fixed by
 * a check constraint (supabase/feedback-choices.sql); the labels are just
 * wording and can change freely. Adding or removing an *option* means editing
 * that constraint to match.
 */

/** Two questions share the same agree scale, so it is written once. */
const AGREE = [
  { v: "strongly_disagree", label: "Strongly disagree" },
  { v: "disagree",          label: "Disagree" },
  { v: "same",              label: "About the same" },
  { v: "agree",             label: "Agree" },
  { v: "strongly_agree",    label: "Strongly agree" },
];

export const CHOICES = [
  {
    key: "study_help",
    question: "Compared with before today’s session, I interacted with others more to give or receive study help",
    options: AGREE,
  },
  {
    key: "belonging",
    question: "Compared with before today’s session, how much do you feel part of the Business School student community?",
    options: [
      { v: "much_less",   label: "Much less" },
      { v: "little_less", label: "A little less" },
      { v: "same",        label: "About the same" },
      { v: "little_more", label: "A little more" },
      { v: "much_more",   label: "Much more" },
      // Not a point on the scale - an opt-out, counted like any other answer.
      { v: "not_sure",    label: "Not sure" },
    ],
  },
  {
    key: "teamwork",
    question: "Compared with before today’s session, I think I understand much better what teamwork requires of me",
    options: AGREE,
  },
  {
    key: "best_bit",
    question: "What was the most useful part of today’s session?",
    options: [
      { v: "examples",     label: "The examples and stories" },
      { v: "facilitators", label: "The fact that facilitators were BCom students as well" },
      { v: "tips",         label: "The practical tips" },
      { v: "activity",     label: "The activity" },
      { v: "questions",    label: "Being able to ask questions" },
      { v: "none",         label: "Honestly – not much" },
    ],
  },
];

/** The written questions, in the order they appear on the form. `comment` is
 *  the original column and keeps its meaning; anything already stored there is
 *  an answer to the belonging question below. */
export const TEXT_QUESTIONS = [
  {
    key: "comment",
    question: "What is one thing you could do in your team this week to help someone feel they belong?",
    placeholder: "One small thing you could actually do…",
  },
  {
    key: "presenter_note",
    question: "Any feedback you’d like to give the presenters today?",
    placeholder: "What worked, what did not…",
  },
];

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
    choices: Object.fromEntries(CHOICES.map((q) => [q.key, choice(rows, q)])),
    text: Object.fromEntries(TEXT_QUESTIONS.map((q) => [q.key, rows
      .filter((r) => r[q.key] && String(r[q.key]).trim())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((r) => ({ answer: String(r[q.key]).trim(), created_at: r.created_at }))])),
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
