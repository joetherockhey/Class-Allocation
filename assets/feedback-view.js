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
function summaryHtml(a) {
  if (!a.responses) return '<p class="sub" style="margin:0">No feedback yet.</p>';

  const bars = (counts, answered) =>
    '<ul class="fbopts">' + counts.map((o) => {
      const pct = answered ? Math.round((o.n / answered) * 100) : 0;
      return '<li' + (o.n ? "" : ' class="zero"') + '><span class="n">' + pct + "%</span>" +
        '<span class="ol">' + escapeHtml(o.label) + "</span>" +
        '<span class="obar"><i style="width:' + (answered ? (o.n / answered) * 100 : 0) + '%"></i></span>' +
        '<span class="sub">' + o.n + "</span></li>";
    }).join("") + "</ul>";

  const quotes = (list) => '<ul class="fbcomments">' + list.map((x) =>
    "<li>" + escapeHtml(x.answer) +
    '<span class="fbfrom">' + escapeHtml(String(x.tutorial).replace(/^T/, "Tut ")) + "</span></li>").join("") + "</ul>";

  return '<div class="fbhead"><h3>Everyone so far</h3>' +
    '<span class="badge ok">' + a.responses + " response" + (a.responses === 1 ? "" : "s") +
    " across " + a.tutorials + " tutorial" + (a.tutorials === 1 ? "" : "s") + "</span></div>" +

    CHOICES.map((q) => {
      const c = a.choices[q.key];
      if (!c.answered) return "";
      return '<div class="fbmetric"><div class="fbq">' + escapeHtml(q.question) +
        '<span class="sub">' + c.answered + " answered" +
        (c.excluded ? " &middot; " + c.excluded + " left out, asked differently" : "") +
        "</span></div>" + bars(c.counts, c.answered) + "</div>";
    }).join("") +

    TEXT_QUESTIONS.map((q) => {
      const t = a.text[q.key];
      if (!t.total) return "";
      const head = '<div class="fbq">' + escapeHtml(q.question) +
        '<span class="sub">' + t.total + " answered" +
        (t.skipped ? " &middot; " + t.skipped + " blank or “n/a”" : "") + "</span></div>";

      // only the question that actually asks for an opinion gets sorted by one
      if (!q.sentiment) return '<div class="fbmetric">' + head + quotes(t.answers) + "</div>";

      return '<div class="fbmetric">' + head +
        CATEGORIES.map((c) => {
          const list = t.byCategory[c.key];
          if (!list.length) return "";
          return '<div class="fbcat fbcat-' + c.key + '"><h5>' + escapeHtml(c.label) +
            "<span>" + list.length + "</span></h5>" + quotes(list) + "</div>";
        }).join("") + "</div>";
    }).join("");
}
