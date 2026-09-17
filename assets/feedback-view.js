/**
 * "Feedback per tutorial" on the home page: pick a tutorial, see how the room
 * rated it. Its own module rather than part of student.js, so the feed keeps
 * working if this breaks.
 */
import { tutorialList, allFeedback, notTest, el, escapeHtml } from "./api.js";
import { CHOICES, TEXT_QUESTIONS, CATEGORIES, byTutorial, summariseAll } from "./feedback-stats.js";

const box = el("fbResults");
let chosen = "__all__";          // which button is selected, kept across refreshes

const draw = () => render().catch((e) => {
  box.innerHTML = '<p class="sub" style="margin:0">Could not load feedback: ' + escapeHtml(e.message) + "</p>";
});

if (box) {
  draw();
  // feedback lands while a tutorial is still running, so keep it current
  setInterval(() => { if (!document.hidden) draw(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) draw(); });
}

async function render() {
  const [tutorials, res] = await Promise.all([tutorialList(), allFeedback()]);
  if (res.error) {
    box.innerHTML = /feedback/.test(res.error)
      ? '<div class="notice">Not set up yet &mdash; run <code>supabase/feedback.sql</code>.</div>'
      : '<div class="notice warn">' + escapeHtml(res.error) + "</div>";
    return;
  }
  const rows = res.data;
  const stats = byTutorial(rows);
  // TEST rows are the scratch tutorial - its panel still works, but it is not
  // a class and does not belong in the headline count.
  const real = rows.filter((r) => notTest({ id: r.tutorial_id }));
  const realTuts = new Set(real.map((r) => r.tutorial_id)).size;
  el("fbTotal").textContent = real.length
    ? real.length + (real.length === 1 ? " response" : " responses") +
      " across " + realTuts + (realTuts === 1 ? " tutorial" : " tutorials")
    : "";

  if (!rows.length) {
    box.innerHTML = '<p class="sub" style="margin:0">Nothing yet. It appears here as soon as ' +
      'the first audience scans the <a href="feedback.html">feedback QR</a>.</p>';
    return;
  }

  const all = summariseAll(rows);

  // the all-tutorials bar sits above the grid rather than in it, so the
  // tutorials themselves fall into even rows
  box.innerHTML =
    '<div id="fbNav">' +
    '<button type="button" class="fball" data-id="__all__">' +
      "<b>All tutorials</b>" +
      '<span class="sub">everyone so far</span>' +
      '<span class="fbcount">' + all.responses + " response" + (all.responses === 1 ? "" : "s") +
      " &middot; " + all.tutorials + " tutorial" + (all.tutorials === 1 ? "" : "s") + "</span></button>" +
    '<div class="fbpicker">' +
    tutorials.map((t) => {
      const s = stats.get(t.id);
      return '<button type="button" class="fbtut' + (s ? "" : " empty") + '" data-id="' +
        escapeHtml(t.id) + '"' + (s ? "" : " disabled") + '>' +
        "<b>" + escapeHtml(t.label.split(" · ")[0]) + "</b>" +
        '<span class="sub">' + escapeHtml(t.when_text || "") + "</span>" +
        '<span class="fbcount">' + (s
          ? s.responses + (s.responses === 1 ? " response" : " responses")
          : "no feedback") + "</span></button>";
    }).join("") + "</div></div><div id='fbDetail'></div>";

  el("fbNav").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (b) { chosen = b.dataset.id; show(chosen); }
  });
  if (chosen !== "__all__" && !stats.has(chosen)) chosen = "__all__";
  show(chosen);

  function show(id) {
    for (const b of box.querySelectorAll("button[data-id]")) b.classList.toggle("on", b.dataset.id === id);
    if (id === "__all__") { el("fbDetail").innerHTML = summaryHtml(all); return; }
    const t = tutorials.find((x) => x.id === id), s = stats.get(id);
    el("fbDetail").innerHTML =
      '<div class="fbhead"><h3>' + escapeHtml(t.label) + "</h3>" +
      '<span class="badge">' +
        s.responses + (s.responses === 1 ? " response" : " responses") + "</span></div>" +
      CHOICES.map((q) => {
        const c = s.choices[q.key];
        if (!c.answered) return '<div class="fbmetric"><div class="fbq">' + escapeHtml(q.question) +
          '<span class="sub">nobody answered</span></div></div>';
        // the wording these people were actually shown, not today's
        const split = c.asked.length > 1;
        return c.asked.map((g, i) =>
          '<div class="fbmetric"><div class="fbq">' + escapeHtml(g.question) +
          '<span class="sub">' + g.answered + " answered" +
            (split ? " &middot; wording " + (i + 1) + " of " + c.asked.length : "") + "</span></div>" +
          '<ul class="fbopts">' + g.counts.map((o) =>
            '<li' + (o.n ? "" : ' class="zero"') + ">" +
            '<span class="n">' + Math.round((o.n / g.answered) * 100) + "%</span>" +
            '<span class="ol">' + escapeHtml(o.label) + "</span>" +
            '<span class="obar"><i style="width:' + ((o.n / g.answered) * 100) + '%"></i></span>' +
            '<span class="sub">' + o.n + "</span></li>").join("") + "</ul></div>").join("");
      }).join("") +
      TEXT_QUESTIONS.map((q) => {
        const answers = s.text[q.key] || [];
        return '<h4 class="fbch">' + escapeHtml(q.question) +
          (answers.length ? " (" + answers.length + ")" : "") + "</h4>" +
          (answers.length
            ? '<ul class="fbcomments">' + answers.map((a) =>
                "<li>" + escapeHtml(a.answer) + "</li>").join("") + "</ul>"
            : '<p class="sub" style="margin:6px 0 0">Nobody answered this one.</p>');
      }).join("");
  }
}

/* ------------------------------------------------- every tutorial at once */
/* The per-tutorial panels stay as lists. This one is read at a glance, so the
 * scale questions become diverging stacked bars centred on "no change" - the
 * form for ordered agree/disagree data - and the pick-one becomes a single
 * part-to-whole bar. Palette validated with the data-viz palette checker
 * against this page's white panel; every segment carries a visible label, which
 * is what the sub-3:1 fills are allowed on. */
const NEG = ["#b3322f", "#e8716e"];        // far from neutral -> near
const NEUTRAL = "#c9c8c3";
const POS = ["#5598e7", "#1c5cab"];        // near neutral -> far
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OFF_SCALE = "not_sure";              // an opt-out, not a point on the scale

/** Split a question's options into the two arms and the middle. */
function arms(counts) {
  const on = counts.filter((o) => o.v !== OFF_SCALE);
  const mid = on.findIndex((o) => o.v === "same");
  const neg = on.slice(0, mid), pos = on.slice(mid + 1);
  return { neg, mid: on[mid], pos, off: counts.find((o) => o.v === OFF_SCALE) };
}

const pct = (n, total) => (total ? (n / total) * 100 : 0);

function divergingBars(questions) {
  // every bar is the full width of the track: the shape of the split is what
  // is being compared, not how many people answered each question
  const rows = questions.map(({ q, c }) => {
    const { neg, mid, pos, off } = arms(c.counts);
    // widths are of the people who picked a point on the scale - "not sure" is
    // not one, so it is counted beside the question rather than drawn
    const total = [...neg, ...(mid ? [mid] : []), ...pos].reduce((a, o) => a + o.n, 0) || 1;
    return { q, c, neg, mid, pos, off, total };
  });

  const seg = (o, total, fill) => {
    const w = pct(o.n, total);
    if (!w) return "";
    return '<i style="width:' + w + '%;background:' + fill + '" title="' +
      escapeHtml(o.label) + ": " + o.n + " (" + Math.round(w) + '%)"></i>';
  };

  return '<div class="dvg">' +
    rows.map((r) =>
      '<div class="dvg-row">' +
        '<div class="dvg-q">' + escapeHtml(r.q.question) +
          '<span class="sub">' + r.c.answered + " answered" +
          (r.c.excluded ? " &middot; " + r.c.excluded + " asked differently, left out" : "") +
          (r.off && r.off.n ? " &middot; " + r.off.n + " not sure" : "") + "</span></div>" +
        '<div class="dvg-bar">' +
          r.neg.map((o, i) => seg(o, r.total, NEG[Math.min(i, NEG.length - 1)])).join("") +
          (r.mid ? seg(r.mid, r.total, NEUTRAL) : "") +
          r.pos.map((o, i) => seg(o, r.total, POS[Math.min(i, POS.length - 1)])).join("") +
        "</div>" +
        '<div class="dvg-key">' +
          r.neg.concat(r.mid ? [r.mid] : []).concat(r.pos)
            .filter((o) => o.n)
            .map((o) => '<span><b>' + Math.round(pct(o.n, r.total)) + "%</b> " +
              escapeHtml(o.label) + "</span>").join("") +
        "</div>" +
      "</div>").join("") +
    "</div>";
}

function partToWhole(q, c) {
  // ponytail: six hues for six options. A seventh would repeat one - fold the
  // tail into "Other" rather than inventing a colour, which never survives
  // colour-blind checking.
  const ranked = c.counts.map((o, i) => ({ ...o, fill: CATEGORICAL[i % CATEGORICAL.length] }));
  return '<div class="fbmetric"><div class="fbq">' + escapeHtml(q.question) +
    '<span class="sub">' + c.answered + " answered</span></div>" +
    '<div class="ptw">' + ranked.filter((o) => o.n).map((o) =>
      '<i style="width:' + pct(o.n, c.answered) + '%;background:' + o.fill + '" title="' +
      escapeHtml(o.label) + ": " + o.n + '"></i>').join("") + "</div>" +
    '<ul class="ptw-key">' + ranked.map((o) =>
      '<li' + (o.n ? "" : ' class="zero"') + '><span class="sw" style="background:' + o.fill + '"></span>' +
      "<b>" + Math.round(pct(o.n, c.answered)) + "%</b> " + escapeHtml(o.label) +
      '<span class="sub">' + o.n + "</span></li>").join("") + "</ul></div>";
}

export function summaryHtml(a) {
  if (!a.responses) return '<p class="sub" style="margin:0">No feedback yet.</p>';

  const scales = CHOICES.filter((q) => q.options.some((o) => o.v === "same") && a.choices[q.key].answered)
    .map((q) => ({ q, c: a.choices[q.key] }));
  const picks = CHOICES.filter((q) => !q.options.some((o) => o.v === "same") && a.choices[q.key].answered);

  const quotes = (list) => '<ul class="fbcomments">' + list.map((x) =>
    "<li>" + escapeHtml(x.answer) +
    '<span class="fbfrom">' + escapeHtml(String(x.tutorial).replace(/^T/, "Tut ")) + "</span></li>").join("") + "</ul>";

  return '<div class="fbhead"><h3>Everyone so far</h3>' +
    '<span class="badge ok">' + a.responses + " response" + (a.responses === 1 ? "" : "s") +
    " across " + a.tutorials + " tutorial" + (a.tutorials === 1 ? "" : "s") + "</span></div>" +

    (scales.length
      ? '<p class="sub dvg-legend"><span class="sw" style="background:' + NEG[0] + '"></span>less' +
        '<span class="sw" style="background:' + NEUTRAL + '"></span>about the same' +
        '<span class="sw" style="background:' + POS[1] + '"></span>more</p>' +
        divergingBars(scales)
      : "") +

    picks.map((q) => partToWhole(q, a.choices[q.key])).join("") +

    TEXT_QUESTIONS.map((q) => {
      const t = a.text[q.key];
      if (!t.total) return "";
      const head = '<div class="fbq">' + escapeHtml(q.question) +
        '<span class="sub">' + t.total + " answered" +
        (t.skipped ? " &middot; " + t.skipped + " blank or “n/a”" : "") + "</span></div>";

      // What people said they would DO, not how they felt. One word -
      // "communicate" - is in most of the answers, so the buckets are tried
      // specific-first and the leftover bucket is the finding: how many named
      // nothing concrete. See ACTION_CLUSTERS.
      if (t.byCluster) {
        const used = t.byCluster.map((c, i) => ({ ...c, fill: CATEGORICAL[i % CATEGORICAL.length] }));
        return '<div class="fbmetric">' + head +
          '<div class="ptw">' + used.filter((c) => c.list.length).map((c) =>
            '<i style="width:' + pct(c.list.length, t.total) + '%;background:' + c.fill + '" title="' +
            escapeHtml(c.label) + ": " + c.list.length + '"></i>').join("") + "</div>" +
          '<ul class="ptw-key">' + used.map((c) =>
            '<li' + (c.list.length ? "" : ' class="zero"') + '><span class="sw" style="background:' +
            c.fill + '"></span><b>' + Math.round(pct(c.list.length, t.total)) + "%</b> " +
            escapeHtml(c.label) + '<span class="sub">' + c.list.length + "</span></li>").join("") + "</ul>" +
          used.filter((c) => c.list.length).map((c) =>
            // same boxes as the sentiment buckets, tinted to match the bar
            '<details class="fbcat" style="border-color:' + c.fill + '"><summary style="color:' +
            c.fill + '">' + escapeHtml(c.label) + "<span>" + c.list.length + "</span></summary>" +
            quotes(c.list) + "</details>").join("") +
          "</div>";
      }

      if (!q.sentiment)
        return '<div class="fbmetric">' + head +
          "<details class=\"fbmore\"><summary>Read all " + t.total + "</summary>" + quotes(t.answers) + "</details></div>";

      const bar = '<div class="ptw">' + CATEGORICAL_TONE.map(([key, fill]) => {
        const n = t.byCategory[key].length;
        return n ? '<i style="width:' + pct(n, t.total) + '%;background:' + fill + '" title="' +
          key + ": " + n + '"></i>' : "";
      }).join("") + "</div>";

      return '<div class="fbmetric">' + head + bar +
        CATEGORIES.map((c) => {
          const list = t.byCategory[c.key];
          if (!list.length) return "";
          return '<details class="fbcat fbcat-' + c.key + '"><summary>' + escapeHtml(c.label) +
            "<span>" + list.length + "</span></summary>" + quotes(list) + "</details>";
        }).join("") + "</div>";
    }).join("");
}

/** Status-ish tones for the three feedback buckets, in the order they are shown. */
const CATEGORICAL_TONE = [["positive", "#0ca30c"], ["constructive", "#2a78d6"], ["critical", "#d03b3b"]];
