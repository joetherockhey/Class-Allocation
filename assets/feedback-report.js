/**
 * The printable report: everything the audience said about the week, as one
 * document you save with the browser's own "Save as PDF".
 *
 * ponytail: no PDF library. Print CSS plus `window.print()` is the native way
 * to make a PDF, keeps the text selectable, and reuses the charts the site
 * already draws. A canvas rasteriser would add two dependencies and produce a
 * worse file.
 *
 * It is a snapshot, not a live view. The week has run and no more feedback is
 * coming, so it is built once on load and never refreshed - unlike the panel
 * on the home page, nothing polls here.
 */
import { allFeedback, photoPosts, el, escapeHtml } from "./api.js";
import { CHOICES, TEXT_QUESTIONS, CATEGORIES, summariseAll } from "./feedback-stats.js";
import { divergingBars, partToWhole, NEG, NEUTRAL, POS, CATEGORICAL, CATEGORICAL_TONE } from "./feedback-view.js";

const out = el("report");

build().catch((e) => {
  out.innerHTML = '<p class="sub">Could not build the report: ' + escapeHtml(e.message) + "</p>";
});

/* --------------------------------------------------------------- pieces */

const tutName = (id) => String(id).replace(/^T/, "Tut ");

const quotes = (list) => '<ul class="fbcomments">' + list.map((x) =>
  "<li>" + escapeHtml(x.answer) +
  '<span class="fbfrom">' + escapeHtml(tutName(x.tutorial)) + "</span></li>").join("") + "</ul>";

const day = (d) => new Date(d).toLocaleDateString("en-AU",
  { weekday: "short", day: "numeric", month: "short" });

/** Phone photos go into storage at full resolution: 22 of them straight into a
 *  PDF is 80MB nobody can email. Supabase resizes them on the way out.
 *
 *  `format=origin` matters as much as the width. Left alone the endpoint hands
 *  back WebP, which a browser cannot put into a PDF as-is - it decodes every
 *  photo to a bitmap and the file comes out bigger than the originals. Asking
 *  for the source format keeps them JPEG, and JPEG goes in untouched.
 *
 *  Both bounds and `resize=contain` are needed together. Given a width alone
 *  the endpoint resizes the width and leaves the height, so a 4896x2754
 *  landscape came back 1400x2754 - every landscape photo squashed into a
 *  portrait frame. A 1400 box with contain fits the longest side either way
 *  and keeps the shape, and it rotates by EXIF, so a photo lands in the PDF
 *  the way the feed shows it.
 *
 *  If the transform endpoint is ever off, the original still loads - a heavy
 *  report beats a report of broken frames. */
const thumb = (url) => url.includes("/storage/v1/object/public/")
  ? url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
    "?width=1400&height=1400&resize=contain&quality=72&format=origin"
  : url;

/** One photo from the feed, with what was posted alongside it. */
const figure = (p) => !p ? "" :
  '<figure class="shot-fig">' +
  '<img src="' + escapeHtml(thumb(p.file_url)) + '" data-full="' + escapeHtml(p.file_url) +
  '" alt="' + escapeHtml(p.file_name || "photo") + '">' +
  "<figcaption>" + escapeHtml(p.body || "") +
  '<span class="by">' + escapeHtml(p.name) + " &middot; " + escapeHtml(day(p.created_at)) +
  "</span></figcaption></figure>";

/** A few lines worth putting on the front page: the longest answers that still
 *  fit in a box. Shorter ones are "great!", longer ones ramble, and a multi-line
 *  answer is usually one with a signature under it, which does not read as a
 *  pull quote.
 *
 *  All three from the positive bucket. Sorting everything by length instead put
 *  three criticisms on the front of a report where 64% of the notes were
 *  positive - the notes that suggest a change are the ones that run long. */
function standouts(text, n = 3) {
  return text.byCategory.positive
    .filter((x) => x.answer.length >= 60 && x.answer.length <= 200 && !/[\r\n]/.test(x.answer))
    .slice().sort((a, b) => b.answer.length - a.answer.length).slice(0, n);
}

/** The positive / developmental / critical split as one part-to-whole bar. */
function toneBar(t) {
  const bar = '<div class="ptw">' + CATEGORICAL_TONE.map(([key, fill]) => {
    const n = t.byCategory[key].length;
    return n ? '<i style="width:' + (n / t.total) * 100 + "%;background:" + fill + '"></i>' : "";
  }).join("") + "</div>";
  return bar + '<ul class="ptw-key">' + CATEGORIES.map((c, i) => {
    const n = t.byCategory[c.key].length;
    return "<li" + (n ? "" : ' class="zero"') + '><span class="sw" style="background:' +
      CATEGORICAL_TONE[i][1] + '"></span><b>' + Math.round((n / t.total) * 100) + "%</b> " +
      escapeHtml(c.label) + '<span class="sub">' + n + "</span></li>";
  }).join("") + "</ul>";
}

/* ---------------------------------------------------------------- build */

async function build() {
  const [res, photos] = await Promise.all([allFeedback(), photoPosts()]);
  if (res.error) throw new Error(res.error);
  const rows = res.data.filter((r) => !String(r.tutorial_id).startsWith("TEST"));
  if (!rows.length) { out.innerHTML = '<p class="sub">No feedback to report.</p>'; return; }

  // Answers given under a wording that asked something materially different
  // are already dropped, per question, by summariseAll() - that is what keeps
  // Tut 22's study-help answers out of the pooled bar without touching any of
  // its other answers. See summaryExclude in WORDING_HISTORY.
  const a = summariseAll(rows);

  const dates = rows.map((r) => new Date(r.created_at)).sort((x, y) => x - y);
  const notes = a.text.presenter_note, belong = a.text.comment;

  const scales = CHOICES.filter((q) => q.options.some((o) => o.v === "same") && a.choices[q.key].answered)
    .map((q) => ({ q, c: a.choices[q.key] }));
  const picks = CHOICES.filter((q) => !q.options.some((o) => o.v === "same") && a.choices[q.key].answered);

  // Photos are handed out one at a time as the sections below are written;
  // whatever is left over lands in the gallery at the end.
  const queue = photos.slice();
  const next = () => figure(queue.shift());

  const tile = (n, label) => '<div class="tile"><b>' + n + "</b><span>" + label + "</span></div>";

  /* ---- page one: the whole week at a glance ---- */
  const front =
    '<section class="sheet">' +
    "<h1>What the audience said</h1>" +
    '<p class="sub">BUS1000 students rating the teamwork sessions they sat in, ' +
    day(dates[0]) + " to " + day(dates[dates.length - 1]) + " 2026. " +
    "Collected anonymously on a QR at the end of each tutorial.</p>" +
    '<div class="tiles">' +
      tile(a.responses, "responses") + tile(a.tutorials, "tutorials") +
      tile(notes.total + belong.total, "written answers") + tile(photos.length, "photos posted") +
    "</div>" +

    '<p class="sub dvg-legend"><span class="sw" style="background:' + NEG[0] + '"></span>less' +
    '<span class="sw" style="background:' + NEUTRAL + '"></span>about the same' +
    '<span class="sw" style="background:' + POS[1] + '"></span>more</p>' +
    divergingBars(scales) +

    picks.map((q) => partToWhole(q, a.choices[q.key])).join("") +

    '<div class="fbmetric"><div class="fbq">Notes to the presenters' +
    '<span class="sub">' + notes.total + " answered</span></div>" + toneBar(notes) + "</div>" +

    '<h2 class="sech">In their words</h2>' + quotes(standouts(notes)) +
    "</section>";

  /* ---- everything they wrote, with the photos running through it ---- */
  const toPresenters =
    '<section class="block"><h2 class="sech">Every note to the presenters' +
    '<span class="badge">' + notes.total + "</span></h2>" +
    '<p class="sub">Sorted by whether there is something to act on rather than by tone. ' +
    "The sentences are printed under each heading, so a wrong bucket is visible.</p>" +
    CATEGORIES.map((c) => {
      const list = notes.byCategory[c.key];
      if (!list.length) return "";
      return '<div class="fbcat fbcat-' + c.key + '"><h3>' + escapeHtml(c.label) +
        "<span>" + list.length + "</span></h3>" + quotes(list) + "</div>" + next();
    }).join("") + "</section>";

  const belonging =
    '<section class="block"><h2 class="sech">' +
    escapeHtml(TEXT_QUESTIONS.find((q) => q.key === "comment").question) +
    '<span class="badge">' + belong.total + "</span></h2>" +
    '<p class="sub">Grouped by the action named rather than by sentiment - these are things ' +
    "people said they would do. The second-to-last group is the answers that named nothing concrete.</p>" +
    belong.byCluster.filter((c) => c.list.length).map((c, i) => {
      const fill = CATEGORICAL[i % CATEGORICAL.length];
      return '<div class="fbcat" style="border-color:' + fill + '"><h3 style="color:' + fill + '">' +
        escapeHtml(c.label) + "<span>" + c.list.length + "</span></h3>" + quotes(c.list) + "</div>" + next();
    }).join("") + "</section>";

  const gallery = queue.length
    ? '<section class="block"><h2 class="sech">The rest of the week' +
      '<span class="badge">' + queue.length + "</span></h2>" +
      '<div class="gallery">' + queue.map((p) => figure(p)).join("") + "</div></section>"
    : "";

  out.innerHTML = front + toPresenters + belonging + gallery;

  for (const img of out.querySelectorAll("img[data-full]")) {
    img.onerror = () => { img.onerror = null; img.src = img.dataset.full; };
  }

  // Opened from the export button: print once the photos are actually there,
  // or the first pass prints empty frames.
  if (new URLSearchParams(location.search).has("print")) {
    await Promise.all([...document.images].map((i) =>
      i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })));
    window.print();
  }
}
