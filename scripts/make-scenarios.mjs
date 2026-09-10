#!/usr/bin/env node
/**
 * Work out what the timetable clashes cost, and what staggering them would buy.
 *
 * Several tutorials run at the same hour in different rooms. A student free at
 * that hour can only present at one of them, which caps how much some people
 * can do. This builds the alternative - every second tutorial of a clashing set
 * pushed back half an hour - and measures both.
 *
 *   node scripts/make-scenarios.mjs input.json
 *
 * Writes input-idea2.json (the staggered timetable) and clashes.json (both
 * plans, measured). Run allocate-multi against input-idea2.json in between.
 */
import { readFileSync, writeFileSync } from "node:fs";

const INPUT = process.argv[2] || "input.json";
const data = JSON.parse(readFileSync(INPUT, "utf8"));

/* --------------------------------------------------------- find the clashes */
const byTime = new Map();
for (const t of data.tutorials) {
  if (!byTime.has(t.when)) byTime.set(t.when, []);
  byTime.get(t.when).push(t);
}
const sets = [...byTime.entries()].filter(([, list]) => list.length > 1);

/** "Wed 10-10:30am" -> the same window pushed back 30 minutes. */
function shift(when) {
  const m = /^(\w+)\s+(\d{1,2})(?::(\d{2}))?(am|pm)?-(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(when);
  if (!m) return null;
  const [, day, h1, m1, ap1, h2, m2, ap2] = m;
  const to24 = (h, ap) => {
    let n = Number(h);
    if (ap === "pm" && n < 12) n += 12;
    if (ap === "am" && n === 12) n = 0;
    return n;
  };
  const start = to24(h1, ap1 || ap2) * 60 + Number(m1 || 0) + 30;
  const end = to24(h2, ap2) * 60 + Number(m2 || 0) + 30;
  const fmt = (v) => {
    const hh = Math.floor(v / 60), mm = v % 60;
    const ap = hh < 12 ? "am" : "pm";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return { text: mm ? `${h12}:${String(mm).padStart(2, "0")}` : `${h12}`, ap };
  };
  const a = fmt(start), b = fmt(end);
  return `${day} ${a.text}${a.ap === b.ap ? "" : a.ap}-${b.text}${b.ap}`;
}

const moves = [];
for (const [when, list] of sets) {
  // "the second one" = whichever comes later in the timetable order
  const ordered = [...list].sort((a, b) =>
    data.tutorials.indexOf(a) - data.tutorials.indexOf(b));
  for (const t of ordered.slice(1)) {
    const to = shift(when);
    if (to) moves.push({ id: t.id, location: t.location || "", from: when, to });
  }
}

/* ------------------------------------------------- build the idea-2 input */
const idea2 = JSON.parse(JSON.stringify(data));
for (const mv of moves) {
  const t = idea2.tutorials.find((x) => x.id === mv.id);
  if (t) t.when = mv.to;
}
writeFileSync("input-idea2.json", JSON.stringify(idea2, null, 1));

console.log(`${sets.length} clashing time slots, ${moves.length} tutorials would move:`);
for (const mv of moves) console.log(`   ${mv.id} ${mv.location}: ${mv.from}  ->  ${mv.to}`);
console.log("\nWrote input-idea2.json");
console.log("Now run:  node scripts/allocate-multi.mjs input-idea2.json --out=groups-idea2.json");

/* ------------------------------------------------------------- measure both */
function measure(planFile, sourceFile) {
  let plan, src;
  try {
    plan = JSON.parse(readFileSync(planFile, "utf8"));
    src = JSON.parse(readFileSync(sourceFile, "utf8"));
  } catch { return null; }
  const load = new Map();
  const choices = [];
  for (const g of plan.groups) {
    for (const m of g.members) {
      load.set(m.name, (load.get(m.name) || 0) + 1);
      choices.push(m.got_choice);
    }
  }
  const submitted = src.students.filter((s) => (s.preferences || []).length);
  const tally = {};
  for (const s of submitted) {
    const n = load.get(s.name) || 0;
    tally[n] = (tally[n] || 0) + 1;
  }
  const sizes = plan.groups.map((g) => g.members.length);
  // double-bookings that survive
  const times = new Map();
  for (const g of plan.groups) {
    if (!times.has(g.when)) times.set(g.when, []);
    times.get(g.when).push(g);
  }
  let clashes = 0;
  const doubled = new Set();
  for (const [, list] of times) {
    if (list.length < 2) continue;
    const c = new Map();
    for (const g of list) for (const m of g.members) c.set(m.name, (c.get(m.name) || 0) + 1);
    for (const [n, k] of c) if (k > 1) { clashes++; doubled.add(n); }
  }
  const withLoad = (n) => submitted.filter((s) => (load.get(s.name) || 0) === n)
    .map((s) => s.name).sort();
  return {
    tally,
    once: withLoad(1),
    twice: withLoad(2),
    four: withLoad(4),
    doubleBooked: [...doubled].sort(),
    none: submitted.filter((s) => !load.get(s.name)).map((s) => s.name).sort(),
    // the full picture under this plan, so the two can be compared line by line
    groups: plan.groups.map((g) => ({
      id: g.tutorial_id, when: g.when, location: g.location || "",
      members: g.members.map((m) => ({ name: m.name, is_vet: m.is_vet })),
    })),
    slots: choices.length,
    meanChoice: +(choices.reduce((a, b) => a + b, 0) / choices.length).toFixed(2),
    minSize: Math.min(...sizes),
    maxSize: Math.max(...sizes),
    covered: plan.groups.filter((g) => g.members.length).length,
    total: plan.groups.length,
    clashes,
  };
}

const one = measure("groups.json", INPUT);
const two = measure("groups-idea2.json", "input-idea2.json");

if (one && two) {
  writeFileSync("clashes.json", JSON.stringify({
    generated_at: new Date().toISOString(),
    sets: sets.map(([when, list]) => ({
      when, tutorials: list.map((t) => ({ id: t.id, location: t.location || "" })),
    })),
    moves,
    idea1: one,
    idea2: two,
  }, null, 2));
  console.log("\n                       keep as is      stagger by 30 min");
  const row = (label, a, b) =>
    console.log("  " + label.padEnd(21) + String(a).padEnd(16) + String(b));
  row("presenting once", one.tally[1] || 0, two.tally[1] || 0);
  row("presenting twice", one.tally[2] || 0, two.tally[2] || 0);
  row("presenting 3 times", one.tally[3] || 0, two.tally[3] || 0);
  row("presenting 4 times", one.tally[4] || 0, two.tally[4] || 0);
  row("total slots filled", one.slots, two.slots);
  row("mean choice", one.meanChoice, two.meanChoice);
  row("group sizes", one.minSize + "-" + one.maxSize, two.minSize + "-" + two.maxSize);
  row("double-bookings", one.clashes, two.clashes);
  console.log("\nWrote clashes.json");
} else {
  console.log("\n(run the allocator on input-idea2.json, then re-run this to measure both)");
}
