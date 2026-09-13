#!/usr/bin/env node
// The only logic in the feedback feature that can be wrong quietly: the sums
// on the home page, and the form offering an option the database will reject.
// Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarise, byTutorial, CHOICES } from "../assets/feedback-stats.js";

const row = (o) => ({ tutorial_id: "T22", study_help: null, belonging: null,
  teamwork: null, best_bit: null, comment: null,
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
}

/* comments: only real ones, newest first */
{
  const s = summarise([
    row({ comment: "  ", created_at: "2026-09-14T01:00:00Z" }),
    row({ comment: "older", created_at: "2026-09-14T02:00:00Z" }),
    row({ comment: "newer", created_at: "2026-09-14T03:00:00Z" }),
  ]);
  assert.deepEqual(s.comments.map((c) => c.comment), ["newer", "older"]);
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

console.log("feedback stats: all good");
