#!/usr/bin/env node
/**
 * Turn groups.json into groups.html - a page to project for the class and to
 * send round afterwards. Data is inlined, so the page needs no database and
 * keeps working if anything else changes.
 *
 *   node scripts/gen-groups-page.mjs groups.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const IN = process.argv[2] || "groups.json";
const OUT = process.argv[3] || "groups.html";
const plan = JSON.parse(readFileSync(IN, "utf8"));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const LONG = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };

/* The full block sits in the label as "Tut 12 · Tue 12-2pm · BHB 2200". */
function fullTime(g) {
  const parts = String(g.label || "").split(" · ");
  const day = (g.when || "").split(" ")[0];
  let f = parts[1] || "";
  if (day && f.slice(0, day.length) === day) f = f.slice(day.length).trim();
  return f;
}
const dayOf = (g) => (g.when || "").split(" ")[0];
const timeOf = (g) => (g.when || "").split(" ").slice(1).join(" ");

const byDay = DAYS.map((d) => ({ day: d, groups: plan.groups.filter((g) => dayOf(g) === d) }))
  .filter((x) => x.groups.length);

const everyone = new Map();
for (const g of plan.groups) {
  for (const m of g.members) {
    if (!everyone.has(m.name)) everyone.set(m.name, { is_vet: m.is_vet, at: [] });
    everyone.get(m.name).at.push(g.tutorial_id);
  }
}
const totalPlaces = plan.groups.reduce((n, g) => n + g.members.length, 0);

const card = (g) => {
  const vets = g.members.filter((m) => m.is_vet).length;
  return `
      <article class="card" data-names="${esc(g.members.map((m) => m.name.toLowerCase()).join("|"))}">
        <header>
          <span class="code">${esc(g.tutorial_id.replace(/^T/, "Tut "))}</span>
          <span class="time">${esc(timeOf(g))}</span>
        </header>
        <p class="where">${esc(g.location)}${fullTime(g) ? ` &middot; full tutorial ${esc(fullTime(g))}` : ""}</p>
        <ol class="who">
          ${g.members.map((m) => `<li data-name="${esc(m.name.toLowerCase())}">${esc(m.name)}${
            m.is_vet ? '<span class="vet">vet</span>' : ""}</li>`).join("\n          ")}
        </ol>
        <footer>${g.members.length} presenting${vets ? "" : " &middot; no vet"}</footer>
      </article>`;
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Presentation groups</title>
<style>
:root{
  color-scheme:light;
  --bg:#f6f7f9;--panel:#fff;--ink:#16191d;--muted:#5f6874;
  --line:#e2e5ea;--line-strong:#cbd1da;--accent:#2f6df6;--accent-soft:#e8f0ff;
  --hit:#fff8dd;--hit-line:#e3b341;--ok:#15803d;--ok-soft:#e7f6ec;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:26px 18px 70px}
h1{font-size:clamp(21px,2.6vw,30px);margin:0 0 4px;letter-spacing:-.02em}
.sub{color:var(--muted);margin:0 0 20px;font-size:14px}
.tools{position:sticky;top:0;z-index:5;background:var(--bg);
  padding:10px 0 14px;margin-bottom:6px;border-bottom:1px solid var(--line)}
#find{width:100%;max-width:420px;font:inherit;padding:11px 14px;border-radius:10px;
  border:1px solid var(--line-strong);background:var(--panel);color:var(--ink)}
#find:focus{outline:2px solid var(--accent);outline-offset:-1px}
#found{margin:10px 0 0;font-size:14px;color:var(--muted);min-height:22px}
#found b{color:var(--ink)}
#found .pill{display:inline-block;background:var(--accent);color:#fff;border-radius:999px;
  padding:2px 9px;margin:0 4px 4px 0;font-size:12.5px;font-weight:600}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);
  margin:26px 0 12px;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:13px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;
  box-shadow:0 1px 2px rgba(16,24,40,.05);transition:box-shadow .12s,border-color .12s}
.card header{display:flex;align-items:baseline;gap:9px;margin-bottom:2px}
.card .code{font-weight:800;font-size:15.5px;letter-spacing:-.01em}
.card .time{margin-left:auto;font-size:13.5px;font-weight:700;color:var(--accent);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.card .where{margin:0 0 11px;color:var(--muted);font-size:12.5px}
ol.who{list-style:none;margin:0;padding:0}
ol.who li{padding:5px 0;border-top:1px solid var(--line);font-size:14px;
  display:flex;align-items:center;gap:7px}
ol.who li:first-child{border-top:none}
ol.who .vet{margin-left:auto;font-size:10.5px;font-weight:700;letter-spacing:.03em;
  background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:1px 7px}
.card footer{margin-top:11px;padding-top:9px;border-top:1px solid var(--line);
  color:var(--muted);font-size:12px}
.card.hit{border-color:var(--hit-line);box-shadow:0 0 0 3px var(--hit)}
li.hit{background:var(--hit);border-radius:5px;font-weight:700;
  margin:0 -6px;padding-left:6px;padding-right:6px}
.card.dim{opacity:.34}
.stats{display:flex;gap:22px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;padding:15px 17px;margin-bottom:6px}
.stats div b{display:block;font-size:23px;letter-spacing:-.02em;line-height:1.2}
.stats div span{color:var(--muted);font-size:12px}
.note{background:#fdf3e3;border:1px solid #e3b341;color:#7a4d05;border-radius:10px;
  padding:12px 14px;font-size:13.5px;margin-top:20px}
footer.end{margin-top:32px;color:var(--muted);font-size:12.5px;text-align:center}
@media print{
  .tools,.note,footer.end{display:none}
  body{background:#fff}
  .grid{grid-template-columns:repeat(3,1fr)}
  .card{break-inside:avoid;box-shadow:none}
}
</style>
</head>
<body>
<div class="wrap">
  <h1>Presentation groups</h1>
  <p class="sub">Everyone presents at ${plan.loads && plan.loads["2"] ? "two or three" : "three"} tutorials. Find your name to see which.</p>

  <div class="stats">
    <div><b>${plan.groups.length}</b><span>tutorials</span></div>
    <div><b>${everyone.size}</b><span>students placed</span></div>
    <div><b>${totalPlaces}</b><span>presentation slots</span></div>
    <div><b>${Object.entries(plan.loads || {}).map(([k, v]) => `${v}&times;${k}`).join(" &middot; ")}</b><span>students &times; tutorials each</span></div>
  </div>

  <div class="tools">
    <input id="find" type="search" placeholder="Type your name…" autocomplete="off" aria-label="Find your name">
    <p id="found"></p>
  </div>

${byDay.map(({ day, groups }) => `  <h2>${LONG[day]}</h2>
  <div class="grid">${groups.map(card).join("")}
  </div>`).join("\n\n")}

${plan.not_submitted && plan.not_submitted.length ? `  <div class="note"><b>Not yet placed:</b> ${
  plan.not_submitted.map(esc).join(", ")} &mdash; no availability submitted. See me after the tutorial.</div>` : ""}

  <footer class="end">Generated ${new Date(plan.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</footer>
</div>

<script>
const find = document.getElementById("find");
const found = document.getElementById("found");
const cards = [...document.querySelectorAll(".card")];

find.addEventListener("input", () => {
  const q = find.value.trim().toLowerCase();
  cards.forEach((c) => { c.classList.remove("hit", "dim"); });
  document.querySelectorAll("li.hit").forEach((li) => li.classList.remove("hit"));
  if (q.length < 2) { found.textContent = ""; return; }

  const names = new Set();
  const mine = [];
  cards.forEach((c) => {
    const hit = c.dataset.names.split("|").some((n) => n.includes(q));
    if (hit) {
      c.classList.add("hit");
      mine.push(c);
      c.querySelectorAll("li").forEach((li) => {
        if (li.dataset.name.includes(q)) { li.classList.add("hit"); names.add(li.textContent.replace("vet", "").trim()); }
      });
    } else c.classList.add("dim");
  });

  if (!mine.length) {
    found.textContent = "No name matches that.";
    cards.forEach((c) => c.classList.remove("dim"));
    return;
  }
  const who = [...names].join(", ");
  found.innerHTML = "<b>" + who + "</b> presents at " +
    mine.map((c) => '<span class="pill">' + c.querySelector(".code").textContent + " " +
      c.querySelector(".time").textContent + "</span>").join("");
  mine[0].scrollIntoView({ behavior: "smooth", block: "center" });
});
</script>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} - ${plan.groups.length} tutorials, ${everyone.size} students, ${totalPlaces} slots.`);
