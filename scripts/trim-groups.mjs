#!/usr/bin/env node
/**
 * Trim oversized tutorial groups down to a cap, taking people out of groups
 * rather than reshuffling everything.
 *
 * Only people who would still present at least MIN_KEEP times afterwards are
 * eligible, so nobody is trimmed below their floor. Where there is a choice it
 * takes whoever presents most, and among those the person who ranked this
 * tutorial worst - so the cut lands where it is felt least.
 *
 * A group with nobody eligible is left over the cap and reported.
 *
 *   node scripts/trim-groups.mjs groups.json --max=5 --protect="Kenn Surya"
 */
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const hit = argv.find((a) => a.startsWith("--" + n + "="));
  return hit ? hit.slice(n.length + 3) : d;
};
const FILE     = argv.find((a) => !a.startsWith("--")) || "groups.json";
const INPUT    = flag("input", "input.json");
const MAX      = Number(flag("max", 5));
const MIN_KEEP = Number(flag("min-keep", 2));
const MIN_GROUP= Number(flag("min-group", 2));
const PROTECT  = argv.filter((a) => a.startsWith("--protect="))
  .map((a) => a.slice("--protect=".length));

const g = JSON.parse(readFileSync(FILE, "utf8"));
const inp = JSON.parse(readFileSync(INPUT, "utf8"));
const prefOf = new Map(inp.students.map((s) => [s.name, s.preferences || []]));

// Placements pinned by hand are off limits: trimming one silently undoes a
// decision someone made deliberately.
const pinned = new Set();
try {
  const pins = JSON.parse(readFileSync("data/pins.json", "utf8"));
  for (const f of pins.force || []) pinned.add(f.name + "|" + f.tutorial);
} catch { /* no pins file */ }
if (pinned.size) console.log("Pinned placements kept: " + [...pinned].map((k) => k.replace("|", " in ")).join(", "));

const load = new Map();
for (const x of g.groups) for (const m of x.members) load.set(m.name, (load.get(m.name) || 0) + 1);

if (PROTECT.length) console.log("Protected (never trimmed): " + PROTECT.join(", "));

const removed = [];
const stuck = [];

for (;;) {
  // deal with the most oversized group first
  const over = g.groups.filter((x) => x.members.length > MAX && !stuck.includes(x.tutorial_id))
    .sort((a, b) => b.members.length - a.members.length);
  if (!over.length) break;
  const grp = over[0];

  const vets = grp.members.filter((m) => m.is_vet).length;
  const eligible = grp.members.filter((m) => {
    if (PROTECT.includes(m.name)) return false;
    if (pinned.has(m.name + "|" + grp.tutorial_id)) return false;
    if ((load.get(m.name) || 0) - 1 < MIN_KEEP) return false;   // would drop too low
    if (m.is_vet && vets === 1) return false;                   // last vet stays
    return true;
  });

  if (!eligible.length) { stuck.push(grp.tutorial_id); continue; }

  // most presentations first, then whoever ranked this tutorial worst
  eligible.sort((a, b) => {
    const la = load.get(a.name) || 0, lb = load.get(b.name) || 0;
    if (la !== lb) return lb - la;
    const ra = (prefOf.get(a.name) || []).indexOf(grp.tutorial_id);
    const rb = (prefOf.get(b.name) || []).indexOf(grp.tutorial_id);
    return rb - ra;
  });

  const go = eligible[0];
  grp.members = grp.members.filter((m) => m.name !== go.name);
  load.set(go.name, (load.get(go.name) || 0) - 1);
  removed.push({
    name: go.name, from: grp.tutorial_id, when: grp.when,
    rank: (prefOf.get(go.name) || []).indexOf(grp.tutorial_id) + 1,
    nowPresenting: load.get(go.name), groupNow: grp.members.length,
  });
}

/* ------------------------------------------------------------------ report */
if (removed.length) {
  console.log(`\nRemoved ${removed.length}:`);
  for (const r of removed) {
    console.log(`   ${r.name.padEnd(22)} out of ${r.from} ${r.when.padEnd(16)}` +
      `(was their choice #${r.rank})  now presents ${r.nowPresenting}x, group down to ${r.groupNow}`);
  }
} else {
  console.log("\nNothing needed removing.");
}

if (stuck.length) {
  console.log(`\nLeft over the cap - nobody could come out without dropping below ${MIN_KEEP}:`);
  for (const id of stuck) {
    const x = g.groups.find((y) => y.tutorial_id === id);
    console.log(`   ${id} ${x.when} has ${x.members.length}: ` +
      x.members.map((m) => `${m.name} (${load.get(m.name)}x${m.is_vet ? ", vet" : ""})`).join(", "));
  }
}

const sizes = g.groups.map((x) => x.members.length);
const tally = {};
for (const s of inp.students.filter((s) => (s.preferences || []).length)) {
  const n = load.get(s.name) || 0;
  tally[n] = (tally[n] || 0) + 1;
}
g.loads = tally;
writeFileSync(FILE, JSON.stringify(g, null, 2));

console.log(`\nGroup sizes now ${Math.min(...sizes)}-${Math.max(...sizes)}` +
  `, ${g.groups.filter((x) => x.members.length > MAX).length} still over ${MAX}` +
  `, ${g.groups.filter((x) => x.members.length < MIN_GROUP).length} under ${MIN_GROUP}.`);
console.log("Presentations each: " +
  Object.keys(tally).sort().map((k) => `${k} -> ${tally[k]}`).join(",  "));
console.log(`\nWrote ${FILE}.`);
