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
const OUT = process.argv[3] || "groups.html";
const plan = JSON.parse(readFileSync(IN, "utf8"));

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

const ordered = DAYS.flatMap((d) => plan.groups.filter((g) => dayOf(g) === d));
const groupNo = new Map(ordered.map((g, i) => [g.tutorial_id, i + 1]));

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

/* --------------------------------------------------------------- by group */
const byGroup = `  <div class="grid">
${ordered.map((g) => `    <article class="card" data-names="${esc(g.members.map((m) => m.name.toLowerCase()).join("|"))}">
      <header><span class="code">Group ${groupNo.get(g.tutorial_id)}</span>
        <span class="time">${esc(g.members.length)} people</span></header>
      <p class="where">presents at <b>${esc(g.tutorial_id.replace(/^T/, "Tut "))}</b> &middot; ${esc(g.when)} &middot; ${esc(g.location)}</p>
      <ol class="who">${memberList(g)}</ol>
    </article>`).join("\n")}
  </div>`;

const loadLine = Object.entries(plan.loads || {}).sort()
  .map(([k, v]) => `${v} student${v === 1 ? "" : "s"} &times; ${k}`).join(" &middot; ");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Presentation groups</title>
<style>
:root{color-scheme:light;
  --bg:#f6f7f9;--panel:#fff;--ink:#16191d;--muted:#5f6874;
  --line:#e2e5ea;--line-strong:#cbd1da;--accent:#2f6df6;--accent-soft:#e8f0ff;
  --hit:#fff8dd;--hit-line:#e3b341}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 70px}
h1{font-size:clamp(20px,2.5vw,29px);margin:0 0 4px;letter-spacing:-.02em}
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
@media print{.tools,.note,details.board,footer.end{display:none}
  body{background:#fff}.grid{grid-template-columns:repeat(3,1fr)}.card{break-inside:avoid;box-shadow:none}}
</style>
</head>
<body>
<div class="wrap">
  <h1>Presentation groups</h1>
  <p class="sub">Everyone presents at two or three tutorials. <a href="index.html">Back to preferences</a></p>

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
      <button role="tab" aria-selected="false" data-view="group">By group</button>
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

  <section id="view-group" hidden>
${byGroup}
  </section>

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
const views = { tut: "view-tut", person: "view-person", group: "view-group" };
tabs.forEach((b) => b.addEventListener("click", () => {
  tabs.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  for (const [k, id] of Object.entries(views)) document.getElementById(id).hidden = k !== b.dataset.view;
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
