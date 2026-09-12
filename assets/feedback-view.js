/**
 * "Feedback per tutorial" on the home page: pick a tutorial, see how the room
 * rated it. Its own module rather than part of student.js, so the feed keeps
 * working if this breaks.
 */
import { loadCore, allFeedback, el, escapeHtml } from "./api.js";
import { METRICS, byTutorial, overall } from "./feedback-stats.js";

const box = el("fbResults");
if (box) render().catch((e) => { box.innerHTML = '<p class="sub" style="margin:0">Could not load feedback: ' + escapeHtml(e.message) + "</p>"; });

async function render() {
  const [{ tutorials }, res] = await Promise.all([loadCore(), allFeedback()]);
  if (res.error) {
    box.innerHTML = /feedback/.test(res.error)
      ? '<div class="notice">Not set up yet &mdash; run <code>supabase/feedback.sql</code>.</div>'
      : '<div class="notice warn">' + escapeHtml(res.error) + "</div>";
    return;
  }
  const rows = res.data;
  const stats = byTutorial(rows);
  el("fbTotal").textContent = rows.length
    ? rows.length + (rows.length === 1 ? " response" : " responses") +
      " across " + stats.size + (stats.size === 1 ? " tutorial" : " tutorials")
    : "";

  if (!rows.length) {
    box.innerHTML = '<p class="sub" style="margin:0">Nothing yet. It appears here as soon as ' +
      'the first audience scans the <a href="feedback.html">feedback QR</a>.</p>';
    return;
  }

  box.innerHTML =
    '<div class="fbpicker" id="fbPicker">' + tutorials.map((t) => {
      const s = stats.get(t.id);
      const o = s ? overall(s) : null;
      return '<button type="button" class="fbtut' + (s ? "" : " empty") + '" data-id="' +
        escapeHtml(t.id) + '"' + (s ? "" : " disabled") + '>' +
        "<b>" + escapeHtml(t.label.split(" · ")[0]) + "</b>" +
        '<span class="sub">' + escapeHtml(t.when_text || "") + "</span>" +
        '<span class="fbcount">' + (s
          ? s.responses + (o === null ? "" : " · " + o + "/10")
          : "no feedback") + "</span></button>";
    }).join("") + "</div><div id='fbDetail'></div>";

  const first = tutorials.find((t) => stats.has(t.id));
  el("fbPicker").addEventListener("click", (e) => {
    const b = e.target.closest("button.fbtut");
    if (b) show(b.dataset.id);
  });
  if (first) show(first.id);

  function show(id) {
    for (const b of box.querySelectorAll("button.fbtut")) b.classList.toggle("on", b.dataset.id === id);
    const t = tutorials.find((x) => x.id === id), s = stats.get(id);
    el("fbDetail").innerHTML =
      '<div class="fbhead"><h3>' + escapeHtml(t.label) + "</h3>" +
      '<span class="badge ' + (overall(s) >= 7 ? "ok" : "") + '">' +
        s.responses + (s.responses === 1 ? " response" : " responses") + "</span></div>" +
      METRICS.map((m) => {
        const d = s.metrics[m.key];
        if (!d.answered) return '<div class="fbmetric"><div class="fbq">' + escapeHtml(m.question) +
          '<span class="sub">nobody answered</span></div></div>';
        return '<div class="fbmetric">' +
          '<div class="fbq">' + escapeHtml(m.question) +
            "<span>" + d.goodPct + "% good &middot; " + d.average + "/10" +
            '<span class="sub"> (' + d.answered + ")</span></span></div>" +
          // widths come straight from the counts, so they always fill the bar
          '<div class="fbbar" role="img" aria-label="' + d.good + " good, " + d.mixed +
            " in between, " + d.bad + ' not good">' +
            seg("good", d.good, d.answered) + seg("mid", d.mixed, d.answered) + seg("bad", d.bad, d.answered) +
          "</div></div>";
      }).join("") +
      (s.comments.length
        ? '<h4 class="fbch">What they wrote (' + s.comments.length + ")</h4>" +
          '<ul class="fbcomments">' + s.comments.map((c) =>
            "<li>" + escapeHtml(c.comment) + "</li>").join("") + "</ul>"
        : '<p class="sub" style="margin:14px 0 0">No written comments for this one.</p>');
  }
}

const seg = (cls, n, total) =>
  n ? '<i class="' + cls + '" style="flex:' + n + '" title="' + n + '"></i>' : "";
