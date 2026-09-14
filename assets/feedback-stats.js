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

/** What the form actually said, so answers are shown under the question the
 *  student read rather than the current wording. Each entry is what changed
 *  from that moment; anything not named here was, and still is, as CHOICES has
 *  it. `from` is when the change reached the site (push + about a minute for
 *  Pages), in UTC.
 *
 *  Add an entry here whenever a question or an option label is reworded while
 *  responses are already in - otherwise older answers quietly re-label
 *  themselves to wording nobody was ever shown. */
export const WORDING_HISTORY = [
  {
    from: "2026-09-13T23:53:08Z",
    questions: {
      study_help: "Compared with before today’s session, I interacted with others to give or receive study help",
      best_bit: "What was the most useful part?",
    },
  },
  {
    from: "2026-09-14T01:02:46Z",
    questions: {
      study_help: "Before today’s session, I interacted with others to give or receive study help",
    },
  },
  {
    from: "2026-09-14T01:31:29Z",
    questions: {
      study_help: "Before today’s session, I interacted with others to give or receive study help",
    },
    labels: { study_help: { same: "Sometimes" } },
  },
  {
    from: "2026-09-14T05:05:43Z",
    labels: { study_help: { same: "Sometimes" } },
  },
  // 15:08:39 AEST - back to the current wording, so nothing to override
  { from: "2026-09-14T05:08:39Z" },
];

/** The wording in force when a response was given. */
function wordingAt(when) {
  let hit = {};
  for (const w of WORDING_HISTORY) if (when >= w.from) hit = w;
  return hit;
}

/** How question `key` was put to whoever answered at `when`. */
export function askedAs(key, when) {
  const w = wordingAt(when);
  const q = CHOICES.find((x) => x.key === key);
  const labels = (w.labels && w.labels[key]) || {};
  return {
    question: (w.questions && w.questions[key]) || q.question,
    options: q.options.map((o) => ({ ...o, label: labels[o.v] || o.label })),
  };
}

/** How the pick-one answers fell. Anything not on the option list is ignored
 *  rather than shown - only the form writes here, and the database will not
 *  accept a value the constraint does not know. */
function choice(rows, q) {
  const counts = q.options.map((o) => ({ ...o, n: rows.filter((r) => r[q.key] === o.v).length }));

  // One group per distinct wording these particular people were shown. Usually
  // there is exactly one; a tutorial answered either side of a rewording has two.
  const groups = [];
  for (const r of rows) {
    if (!r[q.key]) continue;
    const asked = askedAs(q.key, r.created_at);
    const sig = asked.question + "|" + asked.options.map((o) => o.label).join("|");
    let g = groups.find((x) => x.sig === sig);
    if (!g) {
      g = { sig, question: asked.question, answered: 0,
            counts: asked.options.map((o) => ({ ...o, n: 0 })), first: r.created_at };
      groups.push(g);
    }
    const hit = g.counts.find((o) => o.v === r[q.key]);
    if (hit) { hit.n++; g.answered++; }
  }
  groups.sort((a, b) => new Date(a.first) - new Date(b.first));
  return { answered: counts.reduce((a, c) => a + c.n, 0), counts, asked: groups };
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
