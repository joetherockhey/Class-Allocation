#!/usr/bin/env node
// The only logic in the feedback feature that can be wrong quietly: the sums
// on the home page. Run with `npm test`.
import assert from "node:assert/strict";
import { summarise, byTutorial, overall, METRICS, CHOICES } from "../assets/feedback-stats.js";

const row = (o) => ({ tutorial_id: "T22", useful: null, clear: null, engaging: null,
  confident: null, recommend: null, best_bit: null, comment: null,
  created_at: "2026-09-14T00:00:00Z", ...o });

/* buckets: 7+ good, under 4 bad, the rest mixed - and they always add up */
{
  const s = summarise([
    row({ useful: 10 }), row({ useful: 7 }), row({ useful: 6 }),
    row({ useful: 4 }),  row({ useful: 3 }), row({ useful: 0 }),
  ]);
  const m = s.metrics.useful;
  assert.equal(m.answered, 6);
  assert.equal(m.good, 2);          // 10, 7
  assert.equal(m.mixed, 2);         // 6, 4
  assert.equal(m.bad, 2);           // 3, 0
  assert.equal(m.good + m.mixed + m.bad, m.answered);
  assert.equal(m.average, 5);
  assert.equal(m.goodPct, 33);
}

/* a slider nobody moved is not an answer, and never a zero */
{
  const s = summarise([row({ useful: 8 }), row({ useful: null }), row({})]);
  assert.equal(s.responses, 3, "a response still counts even if every slider was skipped");
  assert.equal(s.metrics.useful.answered, 1);
  assert.equal(s.metrics.useful.average, 8);
  assert.equal(s.metrics.clear.answered, 0);
  assert.equal(s.metrics.clear.average, null);
  assert.equal(s.metrics.clear.goodPct, null);
}

/* no responses at all must not divide by zero */
{
  const s = summarise([]);
  assert.equal(s.responses, 0);
  assert.equal(overall(s), null);
  for (const m of METRICS) assert.equal(s.metrics[m.key].answered, 0);
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
    row({ tutorial_id: "T22", useful: 10 }),
    row({ tutorial_id: "T13", useful: 0 }),
    row({ tutorial_id: "T13", useful: 2 }),
  ]);
  assert.equal(g.get("T22").responses, 1);
  assert.equal(g.get("T13").responses, 2);
  assert.equal(g.get("T13").metrics.useful.average, 1);
  assert.equal(g.get("T22").metrics.useful.average, 10);
}

/* overall averages only the metrics that were answered */
{
  const s = summarise([row({ useful: 8, clear: 6 })]);
  assert.equal(overall(s), 7);
}

/* pick-one questions: counted per option, skipped answers are not an option */
{
  const s = summarise([
    row({ recommend: "yes" }), row({ recommend: "yes" }),
    row({ recommend: "no" }),  row({ recommend: null }),
  ]);
  const c = s.choices.recommend;
  assert.equal(c.answered, 3, "a null answer is not a vote");
  assert.equal(c.counts.find((x) => x.v === "yes").n, 2);
  assert.equal(c.counts.find((x) => x.v === "maybe").n, 0);
  assert.equal(c.counts.find((x) => x.v === "no").n, 1);
  assert.equal(c.counts.reduce((a, x) => a + x.n, 0), c.answered);
  // every declared option is present even at zero, so the bar has a full legend
  assert.equal(c.counts.length, CHOICES.find((q) => q.key === "recommend").options.length);
}

/* a value the form could never produce is ignored, not counted */
{
  const s = summarise([row({ best_bit: "nonsense" }), row({ best_bit: "tips" })]);
  assert.equal(s.choices.best_bit.answered, 1);
  assert.equal(s.choices.best_bit.counts.find((x) => x.v === "tips").n, 1);
}

/* no answers at all */
{
  const s = summarise([]);
  for (const q of CHOICES) assert.equal(s.choices[q.key].answered, 0);
}

console.log("feedback stats: all good");
