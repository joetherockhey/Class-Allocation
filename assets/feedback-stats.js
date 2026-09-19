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
      { v: "facilitators", label: "Facilitators were students as well" },
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
    // Answers here are things people intend to do, not opinions - sorting them
    // into positive/critical says nothing (it put twenty of twenty-one in one
    // box). What they are sorted by instead is the action named.
    sentiment: false,
    clusters: true,
  },
  {
    key: "presenter_note",
    question: "Any feedback you’d like to give the presenters today?",
    placeholder: "What worked, what did not…",
    sentiment: true,
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
    // "Before today's session..." asks what they used to do; every other
    // version asks whether today changed it. Not the same question, so these
    // answers stay out of the all-tutorials summary (the tutorial's own panel
    // still shows them, under the wording they were given).
    summaryExclude: ["study_help"],
  },
  {
    from: "2026-09-14T01:31:29Z",
    questions: {
      study_help: "Before today’s session, I interacted with others to give or receive study help",
    },
    labels: { study_help: { same: "Sometimes" } },
    summaryExclude: ["study_help"],
  },
  {
    from: "2026-09-14T05:05:43Z",
    labels: { study_help: { same: "Sometimes" } },
  },
  // 15:08:39 AEST - back to the current wording, so nothing to override
  { from: "2026-09-14T05:08:39Z" },
];

/** Fewer than this many answers under one wording is not worth its own bar. */
export const MIN_WORDING_GROUP = 2;

/** The wording in force when a response was given. */
function wordingAt(when) {
  let hit = {};
  for (const w of WORDING_HISTORY) if (when >= w.from) hit = w;
  return hit;
}

/** True when an answer given at `when` can be pooled with the rest. */
export function inSummary(key, when) {
  const w = wordingAt(when);
  return !(w.summaryExclude || []).includes(key);
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

  // A stray answer or two under a wording almost nobody saw says more about
  // when the question changed than about the room, so it is set aside rather
  // than shown as its own bar. Only ever applies when a bigger group exists.
  let aside = 0;
  let shown = groups;
  if (groups.length > 1) {
    const keep = groups.filter((g) => g.answered >= MIN_WORDING_GROUP);
    if (keep.length) {
      aside = groups.filter((g) => g.answered < MIN_WORDING_GROUP)
                    .reduce((n, g) => n + g.answered, 0);
      shown = keep;
    }
  }
  return { answered: counts.reduce((a, c) => a + c.n, 0), counts, asked: shown, aside };
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

/* ------------------------------------------------------- the written answers */

/** Things people type to mean "nothing to say". Matched whole, after stripping
 *  punctuation - "idk" is not an answer but "idk, talk to them, but..." is. */
const NOT_AN_ANSWER = new Set([
  "", "-", ".", "..", "...", "n a", "na", "nil", "no", "nope", "nah", "none",
  "nothing", "idk", "dunno", "no comment", "nothing really", "not much",
  "no thanks", "all good", "ok", "okay", "fine", "good", "n/a", "nil.",
]);

const normalise = (t) =>
  String(t).toLowerCase().replace(/[^a-z0-9\s\/]/g, " ").replace(/\s+/g, " ").trim();

/** Whether someone actually answered, rather than filling the box to move on. */
export function isRealAnswer(text) {
  const n = normalise(text);
  if (NOT_AN_ANSWER.has(n)) return false;
  if (n.replace(/\s/g, "").length < 3) return false;      // "ok", "..", "x"
  return true;
}

const PRAISE = /\b(good|great|greate|nice|well done|enjoy(ed|able)?|like[d]?|love[d]?|helpful|clear|practical|fun|engaging|interesting|informative|excellent|amazing|awesome|best|thank|appreciat|enthusias|relatable|useful)\b/i;
const SUGGESTION = /\b(could|should|would be|maybe|suggest|improve|next time|instead|more |less |better|clearer|add |longer|shorter|specific|prefer|recommend|need(s|ed)? to|try to|make (the|it|sure))/i;
// "hard to" is qualified: it was put here for "hard to follow", but bare it
// also catches sympathy for the presenters - "they were great, it's hard to
// present to a sleepy Friday class" is praise, and was filed as criticism.
const NEGATIVE = /\b(bad|boring|confus(ing|ed)|unclear|hard to (follow|understand|hear|read|see|know|tell|engage)|too (long|short|fast|slow|much|many)|didn'?t|did not|not (very|really|that)?\s?(good|useful|helpful|clear)|waste|pointless|common sense|irrelevant|nothing new)/i;

/** Rough bucket for a piece of written feedback.
 *
 *  ponytail: keyword rules, not a language model - it runs in the browser on
 *  every refresh and there is nothing to call. It will misfile sarcasm and
 *  anything unusual, which is why the panel prints the sentences underneath
 *  the heading: a wrong bucket is visible and costs the reader nothing.
 *  Swap in a real classifier offline if the volume ever justifies it. */
export function classify(text) {
  // Whether it names something to change is what separates useful feedback
  // from a complaint - tone does not. "We didn't know who to evaluate, make
  // the question more specific" is constructive despite the negative half.
  if (SUGGESTION.test(text)) return "constructive";
  if (NEGATIVE.test(text)) return "critical";
  return PRAISE.test(text) ? "positive" : "constructive";
}

/** Buckets for the belonging answers: what someone said they would actually do.
 *
 *  Order matters. The specific buckets must be tried before the catch-all, or
 *  "communicate" swallows almost every answer - it appears in most of them, so
 *  a word count of these says nothing but COMMUNICATE. What is worth seeing is
 *  the answers that named something concrete, and how many did not.
 *
 *  ponytail: keyword rules like classify(), and shown with the sentences under
 *  each heading, so a misfile is visible and costs the reader nothing. Six
 *  buckets because the palette has six hues; a seventh would repeat one. */
export const ACTION_CLUSTERS = [
  { key: "voice", label: "Invite the quiet ones to speak",
    re: /quiet|heard|includ|contribut|chance to|invite|engage|recogni[sz]|ask\w*\s.{0,24}(opinion|idea|input|everyone|question|concern)|everyone.{0,12}(voice|idea|opinion|say|decision)|all .{0,12}(opinion|idea)|share (their|ideas)/ },
  { key: "outside", label: "Meet or talk outside the room",
    re: /outside|group ?chat|\bgc\b|bond|meet ?up|meeting|social|tea\b|get to know|know them|background|in person|reach out/ },
  { key: "roles", label: "Clarify roles and expectations",
    re: /role|task|delegat|objectiv|expectation|strength|weakness|division|divide|labou?r|plan|brief|notice|deadline|goal/ },
  { key: "care", label: "Check in, and be easy to talk to",
    re: /check|need help|progress|how (they|everyone)|empath|life outside|comfortab|approachab|kind|judge|friendly|open.?mind|positiv|encourag|feedback|contact|regularly/ },
  { key: "talkmore", label: "Just “communicate more”, no action named",
    re: /communicat|commutativ|talk|chat|convo|conversation|speak/ },
  { key: "other", label: "Something else", re: null },
];

/** Which bucket an answer falls in - first rule that matches. */
export function cluster(text) {
  const t = String(text).toLowerCase();
  for (const c of ACTION_CLUSTERS) if (c.re && c.re.test(t)) return c.key;
  return "other";
}

export const CATEGORIES = [
  { key: "positive",     label: "Positive" },
  // the slug stays "constructive" - it is the CSS class and the stored shape
  { key: "constructive", label: "Developmental" },
  { key: "critical",     label: "Critical" },
];

/** One summary across every real tutorial. Answers given under a wording that
 *  asked something materially different are left out per question, so the
 *  percentages are of people who were actually asked the same thing. */
export function summariseAll(rows) {
  const real = rows.filter((r) => !String(r.tutorial_id).startsWith("TEST"));
  const choices = {};
  for (const q of CHOICES) {
    const usable = real.filter((r) => r[q.key] && inSummary(q.key, r.created_at));
    const counts = q.options.map((o) => ({ ...o, n: usable.filter((r) => r[q.key] === o.v).length }));
    const answered = counts.reduce((a, c) => a + c.n, 0);
    choices[q.key] = {
      answered,
      counts,
      excluded: real.filter((r) => r[q.key] && !inSummary(q.key, r.created_at)).length,
    };
  }
  const text = {};
  for (const q of TEXT_QUESTIONS) {
    const answers = real
      .filter((r) => r[q.key] && isRealAnswer(r[q.key]))
      .map((r) => ({ answer: String(r[q.key]).trim(), tutorial: r.tutorial_id,
                     category: classify(String(r[q.key])), created_at: r.created_at }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const skipped = real.filter((r) => r[q.key] && !isRealAnswer(r[q.key])).length;
    text[q.key] = {
      total: answers.length,
      skipped,
      byCategory: Object.fromEntries(CATEGORIES.map((c) =>
        [c.key, answers.filter((a) => a.category === c.key)])),
      // only the pooled view clusters - one tutorial's dozen answers are
      // quicker to read than to bucket
      byCluster: q.clusters
        ? ACTION_CLUSTERS.map((c) => ({ ...c, re: undefined,
            list: answers.filter((a) => cluster(a.answer) === c.key) }))
        : null,
      answers,
    };
  }
  return {
    responses: real.length,
    tutorials: new Set(real.map((r) => r.tutorial_id)).size,
    choices,
    text,
  };
}
