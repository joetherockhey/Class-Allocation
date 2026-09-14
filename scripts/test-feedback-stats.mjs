#!/usr/bin/env node
// The only logic in the feedback feature that can be wrong quietly: the sums
// on the home page, and the form offering an option the database will reject.
// Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarise, byTutorial, CHOICES, TEXT_QUESTIONS, askedAs } from "../assets/feedback-stats.js";

const row = (o) => ({ tutorial_id: "T22", study_help: null, belonging: null,
  teamwork: null, best_bit: null, comment: null, presenter_note: null,
  created_at: "2026-09-14T00:00:00Z", ...o });

/* pick-one questions: counted per option, a skipped answer is not a vote */
{
  const s = summarise([
    row({ study_help: "agree" }), row({ study_help: "agree" }),
    row({ study_help: "disagree" }), row({ study_help: null }),
  ]);
  const c = s.choices.study_help;
  assert.equal(s.responses, 4, "a response counts even when every question was skipped");
  assert.equal(c.answered, 3, "a null answer is not a vote");
  assert.equal(c.counts.find((x) => x.v === "agree").n, 2);
  assert.equal(c.counts.find((x) => x.v === "same").n, 0);
  assert.equal(c.counts.find((x) => x.v === "disagree").n, 1);
  assert.equal(c.counts.reduce((a, x) => a + x.n, 0), c.answered);
  // every declared option is present even at zero, so the bar has a full legend
  assert.equal(c.counts.length, CHOICES.find((q) => q.key === "study_help").options.length);
}

/* "Not sure" is counted like any other answer, not dropped as a non-answer */
{
  const s = summarise([row({ belonging: "not_sure" }), row({ belonging: "much_more" })]);
  assert.equal(s.choices.belonging.answered, 2);
  assert.equal(s.choices.belonging.counts.find((x) => x.v === "not_sure").n, 1);
}

/* a value the form could never produce is ignored, not counted */
{
  const s = summarise([row({ best_bit: "nonsense" }), row({ best_bit: "facilitators" })]);
  assert.equal(s.choices.best_bit.answered, 1);
  assert.equal(s.choices.best_bit.counts.find((x) => x.v === "facilitators").n, 1);
}

/* no responses at all must not divide by zero */
{
  const s = summarise([]);
  assert.equal(s.responses, 0);
  for (const q of CHOICES) assert.equal(s.choices[q.key].answered, 0);
  for (const q of TEXT_QUESTIONS) assert.equal(s.text[q.key].length, 0);
}

/* written answers: only real ones, newest first, and each question its own */
{
  const s = summarise([
    row({ comment: "  ", created_at: "2026-09-14T01:00:00Z" }),
    row({ comment: "older", created_at: "2026-09-14T02:00:00Z" }),
    row({ comment: "newer", presenter_note: "to the presenters", created_at: "2026-09-14T03:00:00Z" }),
  ]);
  assert.deepEqual(s.text.comment.map((a) => a.answer), ["newer", "older"]);
  assert.deepEqual(s.text.presenter_note.map((a) => a.answer), ["to the presenters"]);
}

/* the belonging answers already collected live in `comment` and must stay
 * attached to that question, not drift onto the newer one */
{
  const s = summarise([row({ comment: "I will check in on the quiet one" })]);
  assert.equal(TEXT_QUESTIONS[0].key, "comment", "comment must stay the first written question");
  assert.equal(s.text.comment.length, 1);
  assert.equal(s.text.presenter_note.length, 0);
}

/* grouping keeps tutorials apart */
{
  const g = byTutorial([
    row({ tutorial_id: "T22", best_bit: "tips" }),
    row({ tutorial_id: "T13", best_bit: "tips" }),
    row({ tutorial_id: "T13", best_bit: "activity" }),
  ]);
  assert.equal(g.get("T22").responses, 1);
  assert.equal(g.get("T13").responses, 2);
  assert.equal(g.get("T13").choices.best_bit.counts.find((x) => x.v === "tips").n, 1);
}

/* The quiet one: an option on the form that the check constraint does not
 * allow is a submission that fails only once a student taps it. */
{
  const sql = readFileSync(new URL("../supabase/feedback-choices.sql", import.meta.url), "utf8");
  for (const q of CHOICES) {
    const parts = sql.split("constraint feedback_" + q.key + "_check");
    assert.ok(parts.length > 1, `no check constraint for ${q.key} in supabase/feedback-choices.sql`);
    const decl = parts[parts.length - 1].split(";")[0];
    const allowed = new Set([...decl.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
    for (const o of q.options) {
      assert.ok(allowed.has(o.v), `${q.key}: form offers "${o.v}" but the constraint rejects it`);
    }
    assert.equal(allowed.size, q.options.length, `${q.key}: constraint and form option lists differ`);
  }
}

/* answers are shown under the wording the student was actually shown, not
 * whatever the question says today */
{
  const early = "2026-09-14T00:30:00Z";   // before the 01:02:46Z rewording
  const mid   = "2026-09-14T04:26:00Z";   // T22's slot: "Before today's..." + "Sometimes"
  assert.match(askedAs("study_help", early).question, /^Compared with before/);
  assert.match(askedAs("study_help", mid).question, /^Before today/);
  assert.equal(askedAs("study_help", mid).options.find((o) => o.v === "same").label, "Sometimes");
  assert.equal(askedAs("study_help", early).options.find((o) => o.v === "same").label, "About the same");

  // a tutorial answered either side of a rewording is split, and nothing is lost
  const s = summarise([
    row({ study_help: "same", created_at: early }),
    row({ study_help: "same", created_at: mid }),
  ]);
  const c = s.choices.study_help;
  assert.equal(c.answered, 2);
  // one each side, so neither reaches MIN_WORDING_GROUP and both are still shown
  assert.equal(c.asked.length, 2, "two wordings were in play");
  assert.equal(c.aside, 0);
  assert.equal(c.asked.reduce((n, g) => n + g.answered, 0), c.answered, "every answer lands in one group");
  assert.deepEqual(c.asked.map((g) => g.counts.find((o) => o.v === "same").label),
                   ["About the same", "Sometimes"]);
}

/* a lone answer under a wording the rest of the room never saw is set aside,
 * not given a bar of its own - but it is still counted and reported */
{
  const early = "2026-09-14T00:30:00Z", mid = "2026-09-14T04:26:00Z";
  const s = summarise([
    row({ study_help: "agree", created_at: early }),
    row({ study_help: "agree", created_at: early }),
    row({ study_help: "same",  created_at: mid }),
  ]);
  const c = s.choices.study_help;
  assert.equal(c.answered, 3, "the set-aside answer still counts in the total");
  assert.equal(c.asked.length, 1, "only the wording the room actually saw gets a bar");
  assert.equal(c.aside, 1, "and the odd one out is reported, not silently dropped");
  assert.match(c.asked[0].question, /^Compared with before/);
}

/* nothing is set aside when there is only one wording to begin with */
{
  const s = summarise([row({ study_help: "agree", created_at: "2026-09-14T00:30:00Z" })]);
  assert.equal(s.choices.study_help.aside, 0);
  assert.equal(s.choices.study_help.asked.length, 1);
}

console.log("feedback stats: all good");
