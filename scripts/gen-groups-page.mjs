#!/usr/bin/env node
/**
 * Turn groups.json into groups.html - three ways of reading the same result:
 * by tutorial, by person, and by group. Each tutorial carries a message board
 * backed by Supabase; everything else is inlined so the page still reads if
 * the database is unreachable.
 *
 *   node scripts/gen-groups-page.mjs groups.json groups.html
 */
import { readFileSync, writeFileSync } from "node:fs";

const IN = process.argv[2] || "groups.json";
const OUT = process.argv.slice(3).find((a) => !a.startsWith("--")) || "groups.html";
const plan = JSON.parse(readFileSync(IN, "utf8"));

// take the course name from the same place the rest of the site does
let COURSE_TITLE = "Presentation groups";
try {
  const m = /COURSE_TITLE\s*=\s*"([^"]*)"/.exec(readFileSync("assets/config.js", "utf8"));
  if (m) COURSE_TITLE = m[1];
} catch { /* keep the default */ }

// The clash comparison tab is off by default now that a plan has been chosen.
// Pass --with-clashes to bring it back; clashes.json is still on disk.
let clash = null;
if (process.argv.includes("--with-clashes")) {
  try { clash = JSON.parse(readFileSync("clashes.json", "utf8")); }
  catch { console.log("--with-clashes given but clashes.json is missing; run npm run scenarios"); }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const LONG = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };
const dayOf = (g) => (g.when || "").split(" ")[0];
const timeOf = (g) => (g.when || "").split(" ").slice(1).join(" ");
function fullTime(g) {
  const parts = String(g.label || "").split(" · ");
  const d = dayOf(g);
  let f = parts[1] || "";
  if (d && f.slice(0, d.length) === d) f = f.slice(d.length).trim();
  return f;
}

/* every student -> the tutorials they present at */
const perPerson = new Map();
for (const g of plan.groups) {
  for (const m of g.members) {
    if (!perPerson.has(m.name)) perPerson.set(m.name, { is_vet: m.is_vet, at: [] });
    perPerson.get(m.name).at.push(g);
  }
}
const names = [...perPerson.keys()].sort((a, b) => a.localeCompare(b));
const totalPlaces = plan.groups.reduce((n, g) => n + g.members.length, 0);

const memberList = (g) => g.members
  .map((m) => `<li data-name="${esc(m.name.toLowerCase())}">${esc(m.name)}${
    m.is_vet ? '<span class="vet">vet</span>' : ""}</li>`).join("");

/* ------------------------------------------------------------ by tutorial */
const tutorialCard = (g) => `
      <article class="card" data-names="${esc(g.members.map((m) => m.name.toLowerCase()).join("|"))}">
        <header>
          <span class="code">${esc(g.tutorial_id.replace(/^T/, "Tut "))}</span>
          <span class="time">${esc(timeOf(g))}</span>
        </header>
        <p class="where">${esc(g.location)}${fullTime(g) ? ` &middot; runs ${esc(fullTime(g))}` : ""}</p>
        <ol class="who">${memberList(g)}</ol>
        <details class="board" data-tut="${esc(g.tutorial_id)}">
          <summary>Messages <span class="count"></span></summary>
          <div class="msgs">Loading…</div>
          <form class="post" autocomplete="off">
            <input class="mname" type="text" placeholder="Your name" maxlength="60" required>
            <textarea class="mbody" rows="2" placeholder="Message for this group…" maxlength="500" required></textarea>
            <button type="submit">Post</button>
            <span class="err"></span>
          </form>
        </details>
      </article>`;

const byTutorial = DAYS.map((d) => {
  const gs = plan.groups.filter((g) => dayOf(g) === d);
  if (!gs.length) return "";
  return `  <h2>${LONG[d]}</h2>\n  <div class="grid">${gs.map(tutorialCard).join("")}\n  </div>`;
}).filter(Boolean).join("\n\n");

/* -------------------------------------------------------------- by person */
const byPerson = `  <div class="grid people">
${names.map((n) => {
  const p = perPerson.get(n);
  return `    <article class="card person" data-names="${esc(n.toLowerCase())}">
      <header><span class="code">${esc(n)}</span>${p.is_vet ? '<span class="vet">vet</span>' : ""}</header>
      <ol class="who">${p.at.map((g) =>
        `<li><b>${esc(g.tutorial_id.replace(/^T/, "Tut "))}</b> ${esc(g.when)}<span class="rm">${esc(g.location)}</span></li>`).join("")}</ol>
      <footer>presents ${p.at.length} time${p.at.length === 1 ? "" : "s"}</footer>
    </article>`;
}).join("\n")}
  </div>`;

/* ------------------------------------------------------------- clashes tab */
const nameList = (arr) => arr.length ? arr.map(esc).join(", ") : "nobody";

/** Named consequences, not just counts - who this actually lands on. */
function effects(m) {
  const rows = [
    ["Presenting only once", m.once],
    ["Listed in two tutorials at the same time", m.doubleBooked],
    ["Presenting four times", m.four],
  ].filter(([, arr]) => arr && arr.length);
  if (!rows.length) return '<p class="effect none">Everyone presents two or three times, and nobody is double-booked.</p>';
  return rows.map(([label, arr]) =>
    `<p class="effect"><b>${label} (${arr.length}):</b> ${nameList(arr)}</p>`).join("");
}

/** The full timetable under a plan, so the two can be read side by side. */
function planGroups(m, id) {
  const DAYORD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 };
  const gs = [...m.groups].sort((a, b) =>
    (DAYORD[a.when.split(" ")[0]] ?? 9) - (DAYORD[b.when.split(" ")[0]] ?? 9));
  const moved = new Set((clash.moves || []).map((x) => x.id));
  return `<details class="fullplan" id="${id}">
      <summary>Show all 23 groups under this plan</summary>
      <div class="scrollx"><table class="plangroups">
        <thead><tr><th>Tutorial</th><th>When</th><th>Who presents</th></tr></thead>
        <tbody>${gs.map((g) => `
          <tr class="${moved.has(g.id) && id === "plan2" ? "movedrow" : ""}">
            <td class="tid">${esc(g.id.replace(/^T/, "Tut "))}<span class="rm">${esc(g.location)}</span></td>
            <td class="when">${esc(g.when)}${moved.has(g.id) && id === "plan2" ? '<span class="moved">moved</span>' : ""}</td>
            <td>${g.members.map((x) => esc(x.name) + (x.is_vet ? '<span class="vt">vet</span>' : "")).join(", ")}
              <span class="rm">${g.members.length} presenting</span></td>
          </tr>`).join("")}
        </tbody>
      </table></div>
    </details>`;
}

function planCard(title, sub, m, extra, id) {
  const t = m.tally || {};
  return `      <article class="card plan">
        <header><span class="code">${esc(title)}</span></header>
        <p class="where">${sub}</p>
        ${extra}
        <table class="mini">
          <tr><th>presents once</th><td>${t[1] || 0}</td></tr>
          <tr><th>presents twice</th><td>${t[2] || 0}</td></tr>
          <tr><th>presents 3 times</th><td>${t[3] || 0}</td></tr>
          <tr><th>presents 4 times</th><td>${t[4] || 0}</td></tr>
          <tr><th>slots filled</th><td>${m.slots}</td></tr>
          <tr><th>average choice</th><td>${m.meanChoice}</td></tr>
          <tr><th>group sizes</th><td>${m.minSize}&ndash;${m.maxSize}</td></tr>
          <tr><th>double-booked</th><td>${m.clashes}</td></tr>
        </table>
        ${effects(m)}
        ${planGroups(m, id)}
      </article>`;
}

const clashTab = !clash ? "" : `
  <div class="explain">
    <p>Some tutorials run <b>at the same time in different rooms</b>. Anyone free at that
    hour can only present at one of them, which is what limits how much some people can do.
    Below are the overlapping slots, and two ways of handling them.</p>
  </div>

  <h2>Tutorials that overlap</h2>
  <div class="scrollx"><table class="clashes">
    <thead><tr><th>Time</th><th>Tutorials running together</th></tr></thead>
    <tbody>
${clash.sets.map((s) => `      <tr><td class="when">${esc(s.when)}</td><td>${
  s.tutorials.map((t) => `<span class="chip">${esc(t.id.replace(/^T/, "Tut "))} &middot; ${esc(t.location)}</span>`).join(" ")
}</td></tr>`).join("")}
    </tbody>
  </table></div>

  <h2>Two options</h2>
  <div class="grid plans">
${planCard("Idea 1 &mdash; leave the times alone",
  "Anyone who could do both simply does one or the other. Nothing on the timetable changes.",
  clash.idea1, "", "plan1")}
${planCard("Idea 2 &mdash; stagger by half an hour",
  "The second tutorial of each overlapping pair presents half an hour later, so both can be attended.",
  clash.idea2,
  `<ul class="moves">${clash.moves.map((m) =>
    `<li><b>${esc(m.id.replace(/^T/, "Tut "))}</b> ${esc(m.location)}<br><span class="from">${esc(m.from)}</span> &rarr; <span class="to">${esc(m.to)}</span></li>`).join("")}</ul>`,
  "plan2")}
  </div>

  <div class="verdict">
    <b>The differences, side by side.</b>
    Idea 2 changes ${clash.moves.length} start times and leaves
    ${clash.idea2.tally[1] || 0} student${(clash.idea2.tally[1] || 0) === 1 ? "" : "s"} presenting once
    against ${clash.idea1.tally[1] || 0} under Idea 1; it fills
    ${clash.idea2.slots - clash.idea1.slots > 0 ? clash.idea2.slots - clash.idea1.slots + " more" : Math.abs(clash.idea2.slots - clash.idea1.slots) + " fewer"}
    presentation slots, and the average person lands
    ${Math.abs(clash.idea2.meanChoice - clash.idea1.meanChoice).toFixed(2)} of a place
    ${clash.idea2.meanChoice > clash.idea1.meanChoice ? "further down" : "further up"} their preference list.
    Every moved slot still falls inside its own two-hour tutorial, so no room booking changes.
  </div>`;

const loadLine = Object.entries(plan.loads || {}).sort()
  .map(([k, v]) => `${v} student${v === 1 ? "" : "s"} &times; ${k}`).join(" &middot; ");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Groups &middot; ${esc(COURSE_TITLE)}</title>
<style>
:root{color-scheme:light;
  /* University of Sydney palette - colours only, no crest or wordmark */
  --usyd:#e64626;--charcoal:#1c1c1b;
  --bg:#f4f2ef;--panel:#fff;--ink:#1c1c1b;--muted:#6b6862;
  --line:#e4dfd8;--line-strong:#cdc6bc;--accent:#e64626;--accent-soft:#fdeae5;
  --hit:#fdf3d6;--hit-line:#c8901d}
body::before{content:"";display:block;height:5px;background:var(--usyd)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 70px}
h1{font-size:clamp(20px,2.5vw,29px);margin:0 0 4px;letter-spacing:-.02em;color:var(--charcoal)}
.sub{color:var(--muted);margin:0 0 18px;font-size:14px}
a{color:var(--accent)}
.stats{display:flex;gap:20px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;padding:14px 16px;margin-bottom:14px}
.stats div b{display:block;font-size:22px;letter-spacing:-.02em;line-height:1.2}
.stats div span{color:var(--muted);font-size:12px}
.tools{position:sticky;top:0;z-index:5;background:var(--bg);padding:10px 0 12px;
  border-bottom:1px solid var(--line);margin-bottom:8px}
.tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.tabs button{font:inherit;cursor:pointer;border-radius:9px;padding:8px 15px;font-weight:600;
  border:1px solid var(--line-strong);background:var(--panel);color:var(--ink)}
.tabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}
#find{width:100%;max-width:420px;font:inherit;padding:10px 13px;border-radius:10px;
  border:1px solid var(--line-strong);background:var(--panel);color:var(--ink)}
#find:focus{outline:2px solid var(--accent);outline-offset:-1px}
#found{margin:9px 0 0;font-size:14px;color:var(--muted);min-height:20px}
#found b{color:var(--ink)}
.pill{display:inline-block;background:var(--accent);color:#fff;border-radius:999px;
  padding:2px 9px;margin:0 4px 4px 0;font-size:12.5px;font-weight:600}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);
  margin:24px 0 11px;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(252px,1fr));gap:12px}
.grid.people{grid-template-columns:repeat(auto-fill,minmax(232px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px;
  box-shadow:0 1px 2px rgba(16,24,40,.05)}
.card header{display:flex;align-items:baseline;gap:8px;margin-bottom:2px}
.card .code{font-weight:800;font-size:15px;letter-spacing:-.01em}
.card .time{margin-left:auto;font-size:13px;font-weight:700;color:var(--accent);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.card .where{margin:0 0 10px;color:var(--muted);font-size:12.5px}
ol.who{list-style:none;margin:0;padding:0}
ol.who li{padding:5px 0;border-top:1px solid var(--line);font-size:14px;
  display:flex;align-items:center;gap:6px;flex-wrap:wrap}
ol.who li:first-child{border-top:none}
ol.who .vet,.card header .vet{margin-left:auto;font-size:10.5px;font-weight:700;letter-spacing:.03em;
  background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:1px 7px}
ol.who .rm{width:100%;color:var(--muted);font-size:11.5px}
.card footer{margin-top:10px;padding-top:8px;border-top:1px solid var(--line);
  color:var(--muted);font-size:12px}
.card.hit{border-color:var(--hit-line);box-shadow:0 0 0 3px var(--hit)}
li.hit{background:var(--hit);border-radius:5px;font-weight:700;margin:0 -6px;padding:5px 6px}
.card.dim{opacity:.32}
details.board{margin-top:11px;border-top:1px solid var(--line);padding-top:8px}
details.board summary{cursor:pointer;font-size:12.5px;color:var(--muted);font-weight:600;
  list-style:none;user-select:none}
details.board summary::-webkit-details-marker{display:none}
details.board summary::before{content:"▸ ";color:var(--accent)}
details.board[open] summary::before{content:"▾ "}
details.board .count{color:var(--accent)}
.msgs{margin:9px 0 0;font-size:13px}
.msg{padding:7px 0;border-top:1px solid var(--line)}
.msg:first-child{border-top:none}
.msg b{font-size:12.5px}
.msg time{color:var(--muted);font-size:11px;margin-left:6px}
.msg p{margin:2px 0 0;white-space:pre-wrap;word-break:break-word}
form.post{display:grid;gap:6px;margin-top:9px}
form.post input,form.post textarea{font:inherit;font-size:13px;padding:7px 9px;border-radius:8px;
  border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);width:100%;resize:vertical}
form.post button{font:inherit;font-size:13px;font-weight:600;padding:7px 12px;border-radius:8px;
  border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer;justify-self:start}
form.post button:disabled{opacity:.5;cursor:not-allowed}
form.post .err{font-size:12px;color:#b45309}
.note{background:#fdf3e3;border:1px solid #e3b341;color:#7a4d05;border-radius:10px;
  padding:12px 14px;font-size:13.5px;margin-top:20px}
footer.end{margin-top:30px;color:var(--muted);font-size:12.5px;text-align:center}
details.tojoe{background:var(--panel);border:1px solid var(--line);border-radius:12px;
  padding:12px 14px;margin:0 0 16px}
details.tojoe summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:12px;
  flex-wrap:wrap;user-select:none}
details.tojoe summary::-webkit-details-marker{display:none}
details.tojoe .btn{background:var(--accent);color:#fff;border-radius:9px;padding:9px 16px;
  font-weight:700;font-size:14px;white-space:nowrap}
details.tojoe .hint{color:var(--muted);font-size:13px}
details.tojoe[open] .btn{background:var(--ink)}
#joeForm{display:grid;gap:8px;margin-top:12px}
#joeForm input,#joeForm textarea{font:inherit;font-size:14px;padding:9px 11px;border-radius:9px;
  border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);width:100%;resize:vertical}
#joeForm input:focus,#joeForm textarea:focus{outline:2px solid var(--accent);outline-offset:-1px}
#joeForm .row{display:flex;align-items:center;gap:11px;flex-wrap:wrap}
#joeForm button{font:inherit;font-size:14px;font-weight:600;padding:9px 18px;border-radius:9px;
  border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
#joeForm button:disabled{opacity:.5;cursor:not-allowed}
#joeMsg{font-size:13px}
#joeMsg.ok{color:#15803d;font-weight:600}
#joeMsg.err{color:#b45309}
.explain{background:var(--panel);border:1px solid var(--line);border-radius:12px;
  padding:14px 16px;margin:4px 0 6px;font-size:14px}
.explain p{margin:0}
.scrollx{overflow-x:auto}
table.clashes{width:100%;border-collapse:collapse;font-size:14px;background:var(--panel);
  border:1px solid var(--line);border-radius:12px;overflow:hidden}
table.clashes th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;
  color:var(--muted);padding:9px 12px;background:var(--bg);border-bottom:1px solid var(--line)}
table.clashes td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
table.clashes tr:last-child td{border-bottom:none}
table.clashes td.when{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.chip{display:inline-block;background:var(--accent-soft);color:var(--accent);border-radius:999px;
  padding:3px 10px;margin:0 5px 4px 0;font-size:12.5px;font-weight:600;white-space:nowrap}
.grid.plans{grid-template-columns:repeat(auto-fit,minmax(310px,1fr));align-items:start}
.card.plan{padding:16px}
.card.plan .code{font-size:15.5px;line-height:1.3}
p.effect{margin:9px 0 0;font-size:12.5px;background:var(--bg);border:1px solid var(--line);
  border-radius:8px;padding:8px 10px;line-height:1.45}
p.effect b{color:var(--ink)}
p.effect.none{background:#e7f6ec;border-color:#15803d;color:#15803d}
details.fullplan{margin-top:11px;border-top:1px solid var(--line);padding-top:9px}
details.fullplan summary{cursor:pointer;font-size:12.5px;color:var(--accent);font-weight:600;
  list-style:none;user-select:none}
details.fullplan summary::-webkit-details-marker{display:none}
details.fullplan summary::before{content:"▸ "}
details.fullplan[open] summary::before{content:"▾ "}
table.plangroups{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:9px}
table.plangroups th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
  color:var(--muted);padding:6px 7px;border-bottom:1px solid var(--line-strong)}
table.plangroups td{padding:7px;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.45}
table.plangroups td.tid{font-weight:700;white-space:nowrap}
table.plangroups td.when{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--muted)}
table.plangroups .rm{display:block;color:var(--muted);font-weight:400;font-size:11px}
table.plangroups .vt{font-size:9.5px;font-weight:700;background:var(--accent-soft);color:var(--accent);
  border-radius:999px;padding:0 5px;margin-left:3px}
table.plangroups tr.movedrow{background:#fff8dd}
table.plangroups .moved{display:inline-block;background:#e3b341;color:#4a3000;border-radius:999px;
  padding:0 6px;margin-left:5px;font-size:9.5px;font-weight:700;text-transform:uppercase}
table.mini{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}
table.mini th{text-align:left;font-weight:500;color:var(--muted);padding:5px 0;
  border-bottom:1px solid var(--line);font-size:13px;text-transform:none;letter-spacing:0}
table.mini td{text-align:right;padding:5px 0;border-bottom:1px solid var(--line);
  font-weight:700;font-variant-numeric:tabular-nums}
table.mini tr:last-child th,table.mini tr:last-child td{border-bottom:none}
table.mini td.good{color:#15803d}
table.mini td.bad{color:#b45309}
ul.moves{list-style:none;margin:0 0 10px;padding:10px;background:var(--bg);
  border:1px solid var(--line);border-radius:9px;font-size:12.5px}
ul.moves li{padding:5px 0;border-top:1px solid var(--line)}
ul.moves li:first-child{border-top:none}
ul.moves .from{color:var(--muted);text-decoration:line-through}
ul.moves .to{color:var(--accent);font-weight:700}
p.onlyonce{margin:10px 0 0;font-size:12.5px;color:#7a4d05;background:#fdf3e3;
  border:1px solid #e3b341;border-radius:8px;padding:8px 10px}
p.onlyonce.good{color:#15803d;background:#e7f6ec;border-color:#15803d}
.verdict{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--accent);
  border-radius:10px;padding:14px 16px;margin-top:16px;font-size:14px}
@media print{.tools,.note,details.board,footer.end{display:none}
  body{background:#fff}.grid{grid-template-columns:repeat(3,1fr)}.card{break-inside:avoid;box-shadow:none}}
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(COURSE_TITLE)}</h1>
  <h2 style="margin:0 0 4px">Presentation groups</h2>
  <p class="sub">Everyone presents at two or three tutorials. <a href="index.html">Back to preferences</a></p>

  <details class="tojoe">
    <summary><span class="btn">Send a message to Joe</span><span class="hint">Something wrong with your schedule? Tell me here.</span></summary>
    <form id="joeForm" autocomplete="off">
      <input id="joeName" type="text" placeholder="Your name" maxlength="60" required>
      <textarea id="joeBody" rows="4" maxlength="1000" required
        placeholder="What is the problem? For example: a clash with another class, or you cannot make one of the times you have been given."></textarea>
      <div class="row">
        <button type="submit">Send</button>
        <span id="joeMsg"></span>
      </div>
    </form>
  </details>

  <div class="stats">
    <div><b>${plan.groups.length}</b><span>tutorials</span></div>
    <div><b>${perPerson.size}</b><span>students</span></div>
    <div><b>${totalPlaces}</b><span>presentation slots</span></div>
    <div><b>${loadLine || "&mdash;"}</b><span>tutorials each</span></div>
  </div>

  <div class="tools">
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="true"  data-view="tut">By tutorial</button>
      <button role="tab" aria-selected="false" data-view="person">By person</button>
${clash ? `
      <button role="tab" aria-selected="false" data-view="clash">Tutorial clashes</button>` : ""}
    </div>
    <input id="find" type="search" placeholder="Type a name to find them…" autocomplete="off" aria-label="Find a name">
    <p id="found"></p>
  </div>

  <section id="view-tut">
${byTutorial}
  </section>

  <section id="view-person" hidden>
${byPerson}
  </section>

${clash ? `  <section id="view-clash" hidden>
${clashTab}
  </section>` : ""}

${plan.not_submitted && plan.not_submitted.length ? `  <div class="note"><b>Not presenting:</b> ${
  plan.not_submitted.map(esc).join(", ")} &mdash; no availability submitted. See me if that is wrong.</div>` : ""}

  <footer class="end">Generated ${new Date(plan.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</footer>
</div>

<script type="module">
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./assets/config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const db = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

/* ---------------------------------------------------------------- tabs */
const tabs = [...document.querySelectorAll(".tabs button")];
const views = { tut: "view-tut", person: "view-person"${clash ? ', clash: "view-clash"' : ""} };
tabs.forEach((b) => b.addEventListener("click", () => {
  tabs.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  for (const [k, id] of Object.entries(views)) {
    const el = document.getElementById(id);
    if (el) el.hidden = k !== b.dataset.view;
  }
  filter();
}));

/* -------------------------------------------------------------- search */
const find = document.getElementById("find");
const found = document.getElementById("found");

function filter() {
  const q = find.value.trim().toLowerCase();
  const open = document.querySelector("section:not([hidden])");
  const cards = [...open.querySelectorAll(".card")];
  cards.forEach((c) => c.classList.remove("hit", "dim"));
  open.querySelectorAll("li.hit").forEach((li) => li.classList.remove("hit"));
  if (q.length < 2) { found.textContent = ""; return; }

  const hits = [];
  const who = new Set();
  cards.forEach((c) => {
    if ((c.dataset.names || "").split("|").some((n) => n.includes(q))) {
      c.classList.add("hit"); hits.push(c);
      c.querySelectorAll("li[data-name]").forEach((li) => {
        if (li.dataset.name.includes(q)) { li.classList.add("hit"); who.add(li.textContent.replace("vet", "").trim()); }
      });
    } else c.classList.add("dim");
  });
  if (!hits.length) { found.textContent = "No name matches that."; cards.forEach((c) => c.classList.remove("dim")); return; }
  found.innerHTML = (who.size ? "<b>" + [...who].join(", ") + "</b> &mdash; " : "") +
    hits.length + " card" + (hits.length === 1 ? "" : "s") +
    (open.id === "view-tut"
      ? ": " + hits.map((c) => '<span class="pill">' + c.querySelector(".code").textContent + " " +
          c.querySelector(".time").textContent + "</span>").join("")
      : "");
  hits[0].scrollIntoView({ behavior: "smooth", block: "center" });
}
find.addEventListener("input", filter);

/* ------------------------------------------------------- message to Joe */
const joeForm = document.getElementById("joeForm");
if (joeForm) {
  const nameEl = document.getElementById("joeName");
  const bodyEl = document.getElementById("joeBody");
  const out = document.getElementById("joeMsg");
  try { nameEl.value = localStorage.getItem("tutgroups.msgname") || ""; } catch { /* private mode */ }

  joeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    out.className = "";
    out.textContent = "";
    const name = nameEl.value.trim(), body = bodyEl.value.trim();
    if (!name || !body) { out.className = "err"; out.textContent = "Name and message are both needed."; return; }
    if (!db) { out.className = "err"; out.textContent = "Not connected."; return; }
    const btn = joeForm.querySelector("button");
    btn.disabled = true;
    const { error } = await db.from("tutor_messages").insert({ name, body });
    btn.disabled = false;
    if (error) {
      out.className = "err";
      out.textContent = /tutor_messages/.test(error.message)
        ? "Not set up yet - tell Joe in person."
        : "Could not send: " + error.message;
      return;
    }
    try { localStorage.setItem("tutgroups.msgname", name); } catch { /* ignore */ }
    bodyEl.value = "";
    out.className = "ok";
    out.textContent = "Sent. Joe will see it on his dashboard.";
  });
}

/* ------------------------------------------------------------ messages */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NAME_KEY = "tutgroups.msgname";

async function loadBoard(box) {
  const id = box.dataset.tut;
  const list = box.querySelector(".msgs");
  if (!db) { list.textContent = "Messages are not available."; return; }
  const { data, error } = await db.from("messages").select("*")
    .eq("tutorial_id", id).order("created_at");
  if (error) {
    list.innerHTML = '<span class="err">Messages are not set up yet.</span>';
    return;
  }
  box.querySelector(".count").textContent = data.length ? "(" + data.length + ")" : "";
  list.innerHTML = data.length
    ? data.map((m) => '<div class="msg"><b>' + esc(m.name) + "</b><time>" +
        new Date(m.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) +
        "</time><p>" + esc(m.body) + "</p></div>").join("")
    : '<span style="color:var(--muted)">No messages yet.</span>';
}

document.querySelectorAll("details.board").forEach((box) => {
  box.addEventListener("toggle", () => { if (box.open) loadBoard(box); }, { once: false });

  const form = box.querySelector("form.post");
  const nameEl = form.querySelector(".mname");
  const bodyEl = form.querySelector(".mbody");
  const err = form.querySelector(".err");
  try { nameEl.value = localStorage.getItem(NAME_KEY) || ""; } catch { /* private mode */ }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    const name = nameEl.value.trim(), body = bodyEl.value.trim();
    if (!name || !body) { err.textContent = "Name and message are both needed."; return; }
    if (!db) { err.textContent = "Not connected."; return; }
    const btn = form.querySelector("button");
    btn.disabled = true;
    const { error } = await db.from("messages")
      .insert({ tutorial_id: box.dataset.tut, name, body });
    btn.disabled = false;
    if (error) { err.textContent = "Could not post: " + error.message; return; }
    try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
    bodyEl.value = "";
    loadBoard(box);
  });
});

/* show how many messages each board holds, without opening them all */
if (db) {
  db.from("messages").select("tutorial_id").then(({ data, error }) => {
    if (error || !data) return;
    const tally = {};
    for (const m of data) tally[m.tutorial_id] = (tally[m.tutorial_id] || 0) + 1;
    document.querySelectorAll("details.board").forEach((box) => {
      const n = tally[box.dataset.tut];
      if (n) box.querySelector(".count").textContent = "(" + n + ")";
    });
  });
}
</script>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} - ${plan.groups.length} tutorials, ${perPerson.size} students, ${totalPlaces} slots.`);
