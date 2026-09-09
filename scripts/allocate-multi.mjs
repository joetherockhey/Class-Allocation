#!/usr/bin/env node
/**
 * Allocate students to tutorial presentation groups, where each student
 * presents at SEVERAL tutorials rather than one.
 *
 * Hard rules
 *   - nobody is ever put in a tutorial they did not list
 *   - every tutorial's group has at least MIN_GROUP people
 *   - every student does at least MIN_LOAD tutorials
 *
 * Preferences, in descending strength
 *   - nobody does more than MAX_LOAD (a 4th is allowed only if forced)
 *   - every group has a vet in it
 *   - people who asked to present together share a group
 *   - three tutorials each rather than two
 *   - groups stay a sensible size
 *   - and, underneath all of it, people get tutorials high on their list
 *
 *   node scripts/allocate-multi.mjs input.json --out=groups.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const hit = argv.find((a) => a.startsWith("--" + n + "="));
  return hit ? hit.slice(n.length + 3) : d;
};
const INPUT     = argv.find((a) => !a.startsWith("--")) || "input.json";
const OUT       = flag("out", "groups.json");
const MIN_GROUP = Number(flag("min-group", 2));
const MAX_GROUP = Number(flag("max-group", 6));
const MIN_LOAD  = Number(flag("min-load", 1));
const IDEAL_LOAD= Number(flag("ideal-load", 3));
const MAX_LOAD  = Number(flag("max-load", 3));
const SEED      = Number(flag("seed", 20260909));
const ROUNDS    = Number(flag("rounds", 6));
const ITERS     = Number(flag("iters", 900000));

/* ------------------------------------------------------------------ costs */
/* Weights encode the stated priority order. Priority 1 outranks priority 2 by
   more than any number of priority-2 breaches can make up, and so on down. */
const C_GROUP_SHORT = 200000;  // 1. every tutorial needs MIN_GROUP presenters
const C_TOO_BIG     = 40000;   // 2. no tutorial above MAX_GROUP
const C_LOAD_SHORT  = 9000;    // 3. everyone who submitted presents at least once
const C_ONLY_ONE    = 900;     //    ...and two is much better than one
const C_ONLY_TWO    = 60;      //    ...and three better still
const C_OVERLOAD    = 1200;    // beyond MAX_LOAD
const C_NO_VET      = 400;     // a group with no vet
const C_BIG         = 4;       // gentle pull towards an even spread
const C_SPLIT_WISH  = 250;     // people who asked to be together, and are not

/* ------------------------------------------------------------------ input */
const data = JSON.parse(readFileSync(INPUT, "utf8"));
const slots = data.tutorials;
const T = slots.length;
const slotIx = new Map(slots.map((t, i) => [t.id, i]));

const everyone = data.students;
const people = everyone.filter((s) => s.preferences && s.preferences.length);
const silent = everyone.filter((s) => !s.preferences || !s.preferences.length);
const N = people.length;

const rank = people.map((p) => {
  const row = new Int16Array(T);
  p.preferences.forEach((id, i) => {
    const ix = slotIx.get(id);
    if (ix !== undefined) row[ix] = i + 1;
  });
  return row;
});
const isVet = people.map((p) => Boolean(p.is_vet));
const canDo = people.map((_, s) => {
  const out = [];
  for (let t = 0; t < T; t++) if (rank[s][t]) out.push(t);
  return out;
});

let wishes = [];
try {
  wishes = JSON.parse(readFileSync("data/together.json", "utf8"))
    .map((w) => ({
      names: w.names,
      idx: w.names.map((n) => people.findIndex((p) => p.name === n)).filter((i) => i >= 0),
    }))
    .filter((w) => w.idx.length > 1);
} catch { /* optional */ }

// A comfortable group size, given how much presenting there is to spread out.
const COMFY = Math.min(MAX_GROUP, Math.max(MIN_GROUP + 1, Math.ceil((N * IDEAL_LOAD) / T) + 1));

/* -------------------------------------------------------------- machinery */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A full solution plus the running totals the cost function needs. */
function blank() {
  return {
    on: Array.from({ length: N }, () => new Uint8Array(T)),
    load: new Int16Array(N),
    size: new Int16Array(T),
    vets: new Int16Array(T),
    rankSum: 0,
  };
}
const add = (st, s, t) => {
  st.on[s][t] = 1; st.load[s]++; st.size[t]++;
  if (isVet[s]) st.vets[t]++;
  st.rankSum += rank[s][t];
};
const drop = (st, s, t) => {
  st.on[s][t] = 0; st.load[s]--; st.size[t]--;
  if (isVet[s]) st.vets[t]--;
  st.rankSum -= rank[s][t];
};

function wishCost(st) {
  let c = 0;
  for (const w of wishes) {
    let shared = 0;
    for (let t = 0; t < T; t++) if (w.idx.every((s) => st.on[s][t])) shared++;
    if (!shared) c += C_SPLIT_WISH;
  }
  return c;
}

function cost(st) {
  let c = st.rankSum + wishCost(st);
  for (let t = 0; t < T; t++) {
    if (st.size[t] < MIN_GROUP) c += (MIN_GROUP - st.size[t]) * C_GROUP_SHORT;
    if (st.size[t] > MAX_GROUP) c += (st.size[t] - MAX_GROUP) * C_TOO_BIG;
    if (!st.vets[t]) c += C_NO_VET;
    if (st.size[t] > COMFY) c += (st.size[t] - COMFY) ** 2 * C_BIG;
  }
  for (let s = 0; s < N; s++) {
    if (st.load[s] < MIN_LOAD) c += (MIN_LOAD - st.load[s]) * C_LOAD_SHORT;
    if (st.load[s] < 2) c += (2 - st.load[s]) * C_ONLY_ONE;
    if (st.load[s] > MAX_LOAD) c += (st.load[s] - MAX_LOAD) * C_OVERLOAD;
    if (st.load[s] < IDEAL_LOAD) c += (IDEAL_LOAD - st.load[s]) * C_ONLY_TWO;
  }
  return c;
}

/* ------------------------------------------------------------------ build */
function seedSolution(rnd) {
  const st = blank();
  // Everyone takes their top choices; scarce tutorials get first refusal so
  // the thinly-subscribed slots are not left short at the end.
  const order = [...Array(N).keys()].sort((a, b) =>
    canDo[a].length - canDo[b].length || rnd() - 0.5);
  for (const s of order) {
    const wanted = [...canDo[s]].sort((a, b) => rank[s][a] - rank[s][b]);
    for (const t of wanted) {
      if (st.load[s] >= IDEAL_LOAD) break;
      if (st.size[t] >= MAX_GROUP) continue;
      add(st, s, t);
    }
    for (const t of wanted) {                 // fill up if the nice ones were full
      if (st.load[s] >= 2) break;
      if (!st.on[s][t] && st.size[t] < MAX_GROUP) add(st, s, t);
    }
  }
  // Any group still short pulls in whoever can attend and is least loaded.
  for (let t = 0; t < T; t++) {
    while (st.size[t] < MIN_GROUP) {
      const cands = [...Array(N).keys()]
        .filter((s) => rank[s][t] && !st.on[s][t])
        .sort((a, b) => st.load[a] - st.load[b] || rank[a][t] - rank[b][t]);
      if (!cands.length) break;
      add(st, cands[0], t);
    }
  }
  return st;
}

function anneal(st, rnd, iters) {
  let cur = cost(st);
  let best = cur;
  let bestOn = st.on.map((r) => r.slice());
  const T0 = 90, T1 = 0.4;

  for (let i = 0; i < iters; i++) {
    const temp = T0 * Math.pow(T1 / T0, i / iters);
    const s = Math.floor(rnd() * N);
    const opts = canDo[s];
    if (!opts.length) continue;
    const t = opts[Math.floor(rnd() * opts.length)];

    let undo;
    const roll = rnd();
    if (st.on[s][t] && roll < 0.42) {                       // give one up
      drop(st, s, t); undo = () => add(st, s, t);
    } else if (!st.on[s][t] && roll < 0.84) {               // take one on
      add(st, s, t); undo = () => drop(st, s, t);
    } else {                                                // trade one for another
      const mine = opts.filter((x) => st.on[s][x]);
      if (!mine.length || st.on[s][t]) continue;
      const give = mine[Math.floor(rnd() * mine.length)];
      drop(st, s, give); add(st, s, t);
      undo = () => { drop(st, s, t); add(st, s, give); };
    }

    const next = cost(st);
    const d = next - cur;
    if (d <= 0 || rnd() < Math.exp(-d / temp)) {
      cur = next;
      if (cur < best) { best = cur; bestOn = st.on.map((r) => r.slice()); }
    } else undo();
  }
  return { best, bestOn };
}

/* -------------------------------------------------------------------- run */
let winner = null;
for (let r = 0; r < ROUNDS; r++) {
  const rnd = mulberry32(SEED + r * 7919);
  const st = seedSolution(rnd);
  const { best, bestOn } = anneal(st, rnd, ITERS);
  if (!winner || best < winner.score) winner = { score: best, on: bestOn };
}

// rebuild the aggregates for the winning assignment
const final = blank();
for (let s = 0; s < N; s++) for (let t = 0; t < T; t++) if (winner.on[s][t]) add(final, s, t);

/* ----------------------------------------------------------------- report */
const groups = slots.map((slot, t) => {
  const members = [];
  for (let s = 0; s < N; s++) if (final.on[s][t]) members.push(s);
  members.sort((a, b) => people[a].name.localeCompare(people[b].name));
  return {
    tutorial_id: slot.id,
    label: slot.label,
    when: slot.when,
    location: slot.location || "",
    members: members.map((s) => ({
      id: people[s].id, name: people[s].name, is_vet: isVet[s],
      got_choice: rank[s][t], load: final.load[s],
    })),
  };
});

const loads = {};
for (let s = 0; s < N; s++) loads[final.load[s]] = (loads[final.load[s]] || 0) + 1;
const overloaded = [...Array(N).keys()].filter((s) => final.load[s] > MAX_LOAD);
const under = [...Array(N).keys()].filter((s) => final.load[s] < MIN_LOAD);
const thin = groups.filter((g) => g.members.length < MIN_GROUP);
const vetless = groups.filter((g) => !g.members.some((m) => m.is_vet));

const pad = (s, n) => String(s).padEnd(n);
console.log("");
for (const g of groups) {
  const v = g.members.filter((m) => m.is_vet).length;
  console.log(`${pad(g.tutorial_id, 5)}${pad(g.when, 18)}${pad(g.location, 16)}` +
    `${g.members.length} presenting, ${v} vet${v === 1 ? "" : "s"}`);
  for (const m of g.members) {
    console.log(`     ${pad(m.name, 24)}${m.is_vet ? "vet " : "    "}choice #${m.got_choice}` +
      `   (doing ${m.load})`);
  }
  console.log("");
}

console.log("How many tutorials each person presents at:");
for (const k of Object.keys(loads).sort()) console.log(`   ${k}: ${loads[k]} students`);
const totalPlaces = groups.reduce((n, g) => n + g.members.length, 0);
const allChoices = groups.flatMap((g) => g.members.map((m) => m.got_choice));
console.log(`Group sizes ${Math.min(...groups.map((g) => g.members.length))}-` +
  `${Math.max(...groups.map((g) => g.members.length))}, ${totalPlaces} slots filled.`);
console.log("Mean choice " + (allChoices.reduce((a, b) => a + b, 0) / allChoices.length).toFixed(2) + ".");

for (const w of wishes) {
  const shared = groups.filter((g) => w.names.every((n) => g.members.some((m) => m.name === n)));
  console.log(`Together (${w.names.join(", ")}): ` +
    (shared.length ? "yes - " + shared.map((g) => g.tutorial_id).join(", ") : "NOT POSSIBLE"));
}

if (thin.length) console.log("SHORT GROUPS: " + thin.map((g) => `${g.tutorial_id} has ${g.members.length}`).join(", "));
if (under.length) console.log("UNDER MINIMUM: " + under.map((s) => people[s].name).join(", "));
if (overloaded.length) {
  console.log(`\nNEEDS ${MAX_LOAD + 1}: these people had to take an extra one - ` +
    overloaded.map((s) => `${people[s].name} (${final.load[s]})`).join(", "));
} else {
  console.log(`\nNobody needed more than ${MAX_LOAD}.`);
}
if (vetless.length) console.log("NO VET: " + vetless.map((g) => g.tutorial_id).join(", "));
if (silent.length) console.log("\nNOT PLACED - never submitted: " + silent.map((s) => s.name).join(", "));

writeFileSync(OUT, JSON.stringify({
  generated_at: new Date().toISOString(),
  score: winner.score,
  groups,
  loads,
  not_submitted: silent.map((s) => s.name),
  needed_extra: overloaded.map((s) => ({ name: people[s].name, load: final.load[s] })),
  vetless: vetless.map((g) => g.tutorial_id),
}, null, 2));
console.log(`\nWrote ${OUT}.`);
