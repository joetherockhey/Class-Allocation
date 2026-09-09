#!/usr/bin/env node
/**
 * Build presentation groups from exported preferences.
 *
 * Hard constraints
 *   - every member of a group can attend that group's tutorial slot
 *   - each group holds at least one vet
 *   - group sizes stay within one of each other
 *   - at most --per-slot groups share a tutorial slot (default 1)
 *
 * Objective
 *   - minimise the total preference rank people get (1 = their first choice)
 *
 * Method: randomised restarts (slot choice + most-constrained-first assignment)
 * followed by hill-climbing on moves and swaps. Deterministic for a given --seed.
 *
 *   node scripts/allocate.mjs allocation-input.json --groups=10
 */
import { readFileSync, writeFileSync } from "node:fs";

/* ------------------------------------------------------------------ args */
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.split("=").slice(1).join("=") : dflt;
};
const inputPath = argv.find((a) => !a.startsWith("--")) || "allocation-input.json";
const GROUPS   = Number(flag("groups", 10));
const PER_SLOT = Number(flag("per-slot", 1));
const RESTARTS = Number(flag("restarts", 600));
const STEPS    = Number(flag("steps", 4000));
const OUT      = flag("out", "allocation.json");
const SEED     = Number(flag("seed", 20260909));

/* --------------------------------------------------------------- helpers */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

/* ----------------------------------------------------------------- input */
const data = JSON.parse(readFileSync(inputPath, "utf8"));
const slots = data.tutorials;
const slotIndex = new Map(slots.map((t, i) => [t.id, i]));

const all = data.students;
const people = all.filter((s) => s.preferences && s.preferences.length);
const stranded = all.filter((s) => !s.preferences || !s.preferences.length);

// rank[p][slotIdx] = 1-based preference, or 0 if they cannot attend
const rank = people.map((p) => {
  const row = new Int16Array(slots.length);
  p.preferences.forEach((id, i) => {
    const si = slotIndex.get(id);
    if (si !== undefined) row[si] = i + 1;
  });
  return row;
});
const isVet = people.map((p) => Boolean(p.is_vet));
const N = people.length;

if (!N) {
  console.error("No student has submitted any preferences yet.");
  process.exit(1);
}
if (GROUPS > slots.length * PER_SLOT) {
  console.error(`Cannot make ${GROUPS} groups from ${slots.length} slots at ${PER_SLOT} per slot.`);
  process.exit(1);
}

// students available for each slot
const availBySlot = slots.map((_, si) => {
  const out = [];
  for (let p = 0; p < N; p++) if (rank[p][si]) out.push(p);
  return out;
});

const BASE  = Math.floor(N / GROUPS);
const EXTRA = N % GROUPS;                  // this many groups get BASE + 1
const CAP   = EXTRA ? BASE + 1 : BASE;
const MIN   = BASE;

const P_UNASSIGNED = 10000;
const P_NO_VET     = 5000;
const P_OVERSIZE   = 400;

/* ------------------------------------------------- choose the slots to use */
function chooseSlots() {
  const chosen = [];                       // slot indices, may repeat up to PER_SLOT
  const used = new Map();
  const weights = slots.map((_, si) => Math.pow(availBySlot[si].length + 1, 2));

  while (chosen.length < GROUPS) {
    let total = 0;
    for (let si = 0; si < slots.length; si++) {
      if ((used.get(si) || 0) < PER_SLOT) total += weights[si];
    }
    if (total <= 0) break;
    let r = rnd() * total, si = 0;
    for (; si < slots.length; si++) {
      if ((used.get(si) || 0) >= PER_SLOT) continue;
      r -= weights[si];
      if (r <= 0) break;
    }
    if (si >= slots.length) si = slots.findIndex((_, i) => (used.get(i) || 0) < PER_SLOT);
    used.set(si, (used.get(si) || 0) + 1);
    chosen.push(si);
  }

  // Repair: make sure everyone can attend at least one chosen slot.
  for (let pass = 0; pass < 40; pass++) {
    const covered = new Set();
    for (const si of chosen) for (const p of availBySlot[si]) covered.add(p);
    const uncovered = [];
    for (let p = 0; p < N; p++) if (!covered.has(p)) uncovered.push(p);
    if (!uncovered.length) break;

    // slot (not already at PER_SLOT) that covers the most stranded students
    let best = -1, bestGain = 0;
    for (let si = 0; si < slots.length; si++) {
      if ((used.get(si) || 0) >= PER_SLOT) continue;
      const gain = uncovered.filter((p) => rank[p][si]).length;
      if (gain > bestGain) { bestGain = gain; best = si; }
    }
    if (best < 0) break;

    // drop whichever chosen slot is least uniquely useful
    let dropAt = 0, dropScore = Infinity;
    for (let g = 0; g < chosen.length; g++) {
      const others = new Set();
      chosen.forEach((si, h) => { if (h !== g) availBySlot[si].forEach((p) => others.add(p)); });
      const unique = availBySlot[chosen[g]].filter((p) => !others.has(p)).length;
      const score = unique * 1000 + availBySlot[chosen[g]].length;
      if (score < dropScore) { dropScore = score; dropAt = g; }
    }
    used.set(chosen[dropAt], used.get(chosen[dropAt]) - 1);
    chosen[dropAt] = best;
    used.set(best, (used.get(best) || 0) + 1);
  }
  return chosen;
}

/* ------------------------------------------------------------- assignment */
function assign(chosen) {
  const where = new Int16Array(N).fill(-1);      // person -> group index
  const size = new Int16Array(GROUPS);

  // most constrained first: fewest chosen slots they can attend
  const order = [...Array(N).keys()].map((p) => ({
    p,
    n: chosen.filter((si) => rank[p][si]).length,
    j: rnd(),
  })).sort((a, b) => a.n - b.n || a.j - b.j).map((x) => x.p);

  // seed one vet per group first so the vet constraint starts satisfied
  const vetOrder = order.filter((p) => isVet[p]);
  for (let g = 0; g < GROUPS && g < vetOrder.length; g++) {
    const cands = vetOrder.filter((p) => where[p] === -1 && rank[p][chosen[g]]);
    if (!cands.length) continue;
    cands.sort((a, b) => rank[a][chosen[g]] - rank[b][chosen[g]]);
    const p = cands[0];
    where[p] = g; size[g]++;
  }

  for (const p of order) {
    if (where[p] !== -1) continue;
    let best = -1, bestRank = Infinity;
    for (let g = 0; g < GROUPS; g++) {
      const r = rank[p][chosen[g]];
      if (!r || size[g] >= CAP) continue;
      if (r < bestRank) { bestRank = r; best = g; }
    }
    if (best >= 0) { where[p] = best; size[best]++; }
  }
  return where;
}

/* ------------------------------------------------------------------- cost */
function cost(chosen, where) {
  const size = new Int16Array(GROUPS);
  const vets = new Int16Array(GROUPS);
  let total = 0, unassigned = 0;

  for (let p = 0; p < N; p++) {
    const g = where[p];
    if (g < 0) { unassigned++; continue; }
    const r = rank[p][chosen[g]];
    if (!r) return Infinity;                       // never allow an illegal slot
    total += r;
    size[g]++;
    if (isVet[p]) vets[g]++;
  }
  let penalty = unassigned * P_UNASSIGNED;
  for (let g = 0; g < GROUPS; g++) {
    if (!vets[g]) penalty += P_NO_VET;
    // Superlinear so one badly oversized group never looks cheaper than
    // spreading the overflow around.
    if (size[g] > CAP) penalty += Math.pow(size[g] - CAP, 2) * P_OVERSIZE;
    if (size[g] < MIN) penalty += Math.pow(MIN - size[g], 2) * P_OVERSIZE;
  }
  return total + penalty;
}

/* ---------------------------------------------------------- local search */
function improve(chosen, where) {
  let best = cost(chosen, where);
  for (let step = 0; step < STEPS; step++) {
    const p = Math.floor(rnd() * N);
    const from = where[p];

    if (rnd() < 0.5) {                              // move
      const g = Math.floor(rnd() * GROUPS);
      if (g === from || !rank[p][chosen[g]]) continue;
      where[p] = g;
      const c = cost(chosen, where);
      if (c <= best) best = c; else where[p] = from;
    } else {                                        // swap
      const q = Math.floor(rnd() * N);
      const to = where[q];
      if (q === p || to === from) continue;
      if (to >= 0 && !rank[p][chosen[to]]) continue;
      if (from >= 0 && !rank[q][chosen[from]]) continue;
      where[p] = to; where[q] = from;
      const c = cost(chosen, where);
      if (c <= best) best = c; else { where[p] = from; where[q] = to; }
    }
  }
  return best;
}

/* ------------------------------------------------------------------- run */
let bestCost = Infinity, bestChosen = null, bestWhere = null;
for (let r = 0; r < RESTARTS; r++) {
  const chosen = chooseSlots();
  const where = assign(chosen);
  const c = improve(chosen, where);
  if (c < bestCost) { bestCost = c; bestChosen = chosen; bestWhere = where; }
  if (bestCost < P_NO_VET && r > 60 && bestCost === N) break;   // everyone got 1st choice
}

/* ---------------------------------------------------------------- report */
const groups = [];
for (let g = 0; g < GROUPS; g++) {
  const members = [];
  for (let p = 0; p < N; p++) if (bestWhere[p] === g) members.push(p);
  members.sort((a, b) => people[a].name.localeCompare(people[b].name));
  const slot = slots[bestChosen[g]];
  groups.push({
    group_no: g + 1,
    group_name: "Group " + (g + 1),
    tutorial_id: slot.id,
    tutorial_label: slot.label,
    tutorial_when: slot.when,
    members: members.map((p) => ({
      id: people[p].id,
      name: people[p].name,
      is_vet: isVet[p],
      got_choice: rank[p][bestChosen[g]],
    })),
  });
}
const unplaced = [];
for (let p = 0; p < N; p++) if (bestWhere[p] < 0) unplaced.push(people[p].name);

const placed = groups.flatMap((g) => g.members);
const hist = {};
for (const m of placed) hist[m.got_choice] = (hist[m.got_choice] || 0) + 1;

const pad = (s, n) => String(s).padEnd(n);
console.log("");
for (const g of groups) {
  const vets = g.members.filter((m) => m.is_vet).length;
  console.log(`Group ${pad(g.group_no, 3)} ${pad(g.tutorial_label, 14)} ${pad(g.tutorial_when, 30)} ` +
              `${g.members.length} members, ${vets} vet${vets === 1 ? "" : "s"}`);
  for (const m of g.members) {
    console.log(`   ${pad(m.name, 28)} ${m.is_vet ? "vet " : "    "} choice #${m.got_choice}`);
  }
  console.log("");
}
console.log("Choice received:",
  Object.keys(hist).sort((a, b) => a - b).map((k) => `#${k}: ${hist[k]}`).join("   "));
console.log(`Placed ${placed.length} of ${all.length}. Mean choice ` +
  (placed.reduce((s, m) => s + m.got_choice, 0) / placed.length).toFixed(2) + ".");
if (unplaced.length) console.log("NOT PLACED (no compatible slot):", unplaced.join(", "));
if (stranded.length) console.log("NO PREFERENCES SUBMITTED:", stranded.map((s) => s.name).join(", "));

const noVet = groups.filter((g) => !g.members.some((m) => m.is_vet));
if (noVet.length) console.log("WARNING - groups without a vet:", noVet.map((g) => g.group_no).join(", "));

const wrongSize = groups.filter((g) => g.members.length < MIN || g.members.length > CAP);
if (wrongSize.length) {
  console.log(`WARNING - target size is ${MIN}-${CAP}, but these groups differ: ` +
    wrongSize.map((g) => `#${g.group_no} has ${g.members.length}`).join(", "));
  console.log("  This happens when people list very few slots. Options: ask them to add more,");
  console.log("  raise --groups, or accept the imbalance.");
}

writeFileSync(OUT, JSON.stringify({
  generated_at: new Date().toISOString(),
  seed: SEED, cost: bestCost, groups, unplaced,
  no_preferences: stranded.map((s) => s.name),
}, null, 2));
console.log(`\nWrote ${OUT}. Review it, then: npm run publish`);
