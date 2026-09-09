#!/usr/bin/env node
/**
 * Build STANDING TEAMS: the same people present together every time, so team A
 * takes Monday morning and Tuesday afternoon and nothing else.
 *
 * The trick is to choose the DUTIES first, not the teams. Split the tutorials
 * into K duty-sets of 2-3 tutorials each, then staff each duty-set with people
 * free for every tutorial in it. Growing teams first and hoping they share
 * slots does not work - five people rarely have two free periods in common, and
 * the search wastes itself on teams that could never present together.
 *
 * Rules
 *   - a team is MIN_TEAM..MAX_TEAM people
 *   - a team only takes tutorials EVERY member listed
 *   - every tutorial is covered, exactly once
 *   - every student is in exactly one team, presenting MIN_TUT..MAX_TUT times
 *
 * Preferences
 *   - scarce tutorials are placed first: they decide whether a split works
 *   - people who asked to be together share a team
 *   - tutorials sit high on their team's lists
 *
 * Anyone the search cannot seat is reported, never quietly dropped.
 *
 *   node scripts/allocate-teams.mjs input.json --out=teams.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const hit = argv.find((a) => a.startsWith("--" + n + "="));
  return hit ? hit.slice(n.length + 3) : d;
};
const INPUT    = argv.find((a) => !a.startsWith("--")) || "input.json";
const OUT      = flag("out", "teams.json");
const MAX_TEAM = Number(flag("max-team", 5));
const MIN_TEAM = Number(flag("min-team", 2));
const MIN_TUT  = Number(flag("min-tut", 2));
const MAX_TUT  = Number(flag("max-tut", 3));
const SEED     = Number(flag("seed", 20260909));
const ITERS    = Number(flag("iters", 260000));
const RESTARTS = Number(flag("restarts", 3));

const C_UNSEATED  = 40000;   // a student with nowhere to go
const C_THIN      = 25000;   // a duty-set too few people can staff
const C_SPLIT     = 1200;    // a together-wish broken up
const C_NOVET     = 500;     // a team with no vet
const C_IMBALANCE = 30;      // per person away from an even spread

/* ------------------------------------------------------------------ input */
const data = JSON.parse(readFileSync(INPUT, "utf8"));
const slots = data.tutorials;
const T = slots.length;
if (T > 31) { console.error("This build assumes at most 31 tutorials."); process.exit(1); }
const slotIx = new Map(slots.map((t, i) => [t.id, i]));

const everyone = data.students;
const people = everyone.filter((s) => s.preferences && s.preferences.length);
const silent = everyone.filter((s) => !s.preferences || !s.preferences.length);
const N = people.length;

const rank = people.map((p) => {
  const row = new Int16Array(T);
  p.preferences.forEach((id, i) => { const ix = slotIx.get(id); if (ix !== undefined) row[ix] = i + 1; });
  return row;
});
const isVet = people.map((p) => Boolean(p.is_vet));
const availMask = people.map((_, s) => {
  let m = 0;
  for (let t = 0; t < T; t++) if (rank[s][t]) m |= 1 << t;
  return m;
});
const supply = new Array(T).fill(0);
for (let s = 0; s < N; s++) for (let t = 0; t < T; t++) if (rank[s][t]) supply[t]++;

let wishes = [];
try {
  wishes = JSON.parse(readFileSync("data/together.json", "utf8"))
    .map((w) => ({ names: w.names, idx: w.names.map((n) => people.findIndex((p) => p.name === n)).filter((i) => i >= 0) }))
    .filter((w) => w.idx.length > 1);
} catch { /* optional */ }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------- staffing a split */
/** Given which duty-set each tutorial belongs to, decide who staffs each. */
function staff(K, dutyOf) {
  const setMask = new Int32Array(K);
  for (let t = 0; t < T; t++) setMask[dutyOf[t]] |= 1 << t;

  const ableCount = new Int16Array(K);
  const canDo = [];
  for (let s = 0; s < N; s++) {
    const list = [];
    for (let k = 0; k < K; k++) {
      if ((availMask[s] & setMask[k]) === setMask[k]) { list.push(k); ableCount[k]++; }
    }
    canDo.push(list);
  }

  const seatOf = new Int16Array(N).fill(-1);
  const size = new Int16Array(K);

  // seat wish groups as a block first, so they are never split
  for (const w of wishes) {
    let best = -1, bestRoom = -1;
    for (let k = 0; k < K; k++) {
      if (!w.idx.every((s) => (availMask[s] & setMask[k]) === setMask[k])) continue;
      const room = MAX_TEAM - size[k];
      if (room >= w.idx.length && room > bestRoom) { bestRoom = room; best = k; }
    }
    if (best >= 0) for (const s of w.idx) { seatOf[s] = best; size[best]++; }
  }

  // then the most constrained people, into the emptiest duty-set they can do
  const order = [...Array(N).keys()]
    .filter((s) => seatOf[s] < 0)
    .sort((a, b) => canDo[a].length - canDo[b].length);

  for (const s of order) {
    let best = -1, bestKey = Infinity;
    for (const k of canDo[s]) {
      if (size[k] >= MAX_TEAM) continue;
      let want = 0;
      for (let t = 0; t < T; t++) if (setMask[k] & (1 << t)) want += rank[s][t];
      const key = size[k] * 100 + want;
      if (key < bestKey) { bestKey = key; best = k; }
    }
    if (best >= 0) { seatOf[s] = best; size[best]++; }
  }
  return { setMask, ableCount, seatOf, size };
}

function score(K, dutyOf) {
  const st = staff(K, dutyOf);
  let c = 0;
  const target = N / K;

  for (let s = 0; s < N; s++) {
    if (st.seatOf[s] < 0) { c += C_UNSEATED; continue; }
    const k = st.seatOf[s];
    for (let t = 0; t < T; t++) if (st.setMask[k] & (1 << t)) c += rank[s][t];
  }
  const vets = new Int16Array(K);
  for (let s = 0; s < N; s++) if (st.seatOf[s] >= 0 && isVet[s]) vets[st.seatOf[s]]++;

  for (let k = 0; k < K; k++) {
    if (st.ableCount[k] < MIN_TEAM) c += (MIN_TEAM - st.ableCount[k]) * C_THIN;
    if (st.size[k] < MIN_TEAM) c += (MIN_TEAM - st.size[k]) * C_THIN;
    if (!vets[k]) c += C_NOVET;
    c += Math.abs(st.size[k] - target) * C_IMBALANCE;
  }
  for (const w of wishes) {
    const a = st.seatOf[w.idx[0]];
    if (a < 0 || w.idx.some((s) => st.seatOf[s] !== a)) c += C_SPLIT;
  }
  return { cost: c, st };
}

/* -------------------------------------------------------------------- run */
function solve(K, seed) {
  const rnd = mulberry32(seed);
  const dutyOf = new Int16Array(T).fill(-1);
  const filled = new Int16Array(K);
  const base = Math.floor(T / K), extra = T % K;
  const capOf = (k) => base + (k < extra ? 1 : 0);

  // scarce tutorials choose their partners first
  const byScarcity = [...Array(T).keys()].sort((a, b) => supply[a] - supply[b] || rnd() - 0.5);
  for (const t of byScarcity) {
    let best = -1, bestScore = -1;
    for (let k = 0; k < K; k++) {
      if (filled[k] >= capOf(k)) continue;
      let mask = 1 << t;
      for (let u = 0; u < T; u++) if (dutyOf[u] === k) mask |= 1 << u;
      let able = 0;
      for (let s = 0; s < N; s++) if ((availMask[s] & mask) === mask) able++;
      const sc = able * 10 + rnd();
      if (sc > bestScore) { bestScore = sc; best = k; }
    }
    if (best < 0) best = [...Array(K).keys()].find((k) => filled[k] < capOf(k)) ?? 0;
    dutyOf[t] = best; filled[best]++;
  }

  let cur = score(K, dutyOf).cost;
  let best = cur, bestDuty = dutyOf.slice();
  const H0 = 2600, H1 = 1;

  for (let i = 0; i < ITERS; i++) {
    const temp = H0 * Math.pow(H1 / H0, i / ITERS);
    const t1 = Math.floor(rnd() * T);
    const t2 = Math.floor(rnd() * T);
    const a = dutyOf[t1], b = dutyOf[t2];
    if (a === b) continue;
    let undo;
    if (rnd() < 0.5) {
      dutyOf[t1] = b; dutyOf[t2] = a;
      undo = () => { dutyOf[t1] = a; dutyOf[t2] = b; };
    } else {
      let na = 0, nb = 0;
      for (let u = 0; u < T; u++) { if (dutyOf[u] === a) na++; if (dutyOf[u] === b) nb++; }
      if (na - 1 < MIN_TUT || nb + 1 > MAX_TUT) continue;
      dutyOf[t1] = b;
      undo = () => { dutyOf[t1] = a; };
    }
    const next = score(K, dutyOf).cost;
    const d = next - cur;
    if (d <= 0 || rnd() < Math.exp(-d / temp)) {
      cur = next;
      if (cur < best) { best = cur; bestDuty = dutyOf.slice(); }
    } else undo();
  }
  return { cost: best, dutyOf: bestDuty, K };
}

const loK = Math.max(Math.ceil(N / MAX_TEAM), Math.ceil(T / MAX_TUT));
const hiK = Math.floor(T / MIN_TUT);
if (loK > hiK) {
  console.error(`No workable team count: ${N} students at <=${MAX_TEAM} needs >=${Math.ceil(N / MAX_TEAM)} ` +
    `teams, but ${T} tutorials at >=${MIN_TUT} each allows at most ${hiK}.`);
  process.exit(1);
}
console.log(`Trying ${loK}-${hiK} teams...`);

let champ = null;
for (let K = loK; K <= hiK; K++) {
  for (let r = 0; r < RESTARTS; r++) {
    const got = solve(K, SEED + K * 104729 + r * 7919);
    if (!champ || got.cost < champ.cost) champ = got;
  }
}
const { st } = score(champ.K, champ.dutyOf);
const K = champ.K;

/* ----------------------------------------------------------------- output */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const teams = [];
for (let k = 0; k < K; k++) {
  const members = [];
  for (let s = 0; s < N; s++) if (st.seatOf[s] === k) members.push(s);
  members.sort((a, b) => people[a].name.localeCompare(people[b].name));
  const duties = [];
  for (let t = 0; t < T; t++) if (st.setMask[k] & (1 << t)) duties.push(t);
  teams.push({ k, members, duties });
}
teams.sort((a, b) => a.duties[0] - b.duties[0]);
teams.forEach((t, i) => { t.name = "Team " + LETTERS[i]; });

const unseated = [...Array(N).keys()].filter((s) => st.seatOf[s] < 0);

const groups = slots.map((slot, t) => {
  const team = teams.find((x) => x.duties.includes(t));
  return {
    tutorial_id: slot.id, label: slot.label, when: slot.when, location: slot.location || "",
    team: team ? team.name : "—",
    members: (team ? team.members : []).map((s) => ({
      id: people[s].id, name: people[s].name, is_vet: isVet[s], got_choice: rank[s][t],
    })),
  };
});

const teamOut = teams.map((t) => ({
  name: t.name,
  members: t.members.map((s) => ({ id: people[s].id, name: people[s].name, is_vet: isVet[s] })),
  tutorials: t.duties.map((ix) => ({
    id: slots[ix].id, when: slots[ix].when, location: slots[ix].location || "", label: slots[ix].label,
  })),
}));

const perPerson = people.map((p, s) => {
  const team = teams.find((t) => t.members.includes(s));
  return {
    name: p.name, is_vet: isVet[s], team: team ? team.name : "—",
    tutorials: (team ? team.duties : []).map((ix) => ({
      id: slots[ix].id, when: slots[ix].when, location: slots[ix].location || "",
      got_choice: rank[s][ix],
    })),
  };
}).sort((a, b) => a.name.localeCompare(b.name));

const pad = (s, n) => String(s).padEnd(n);
console.log("");
for (const t of teamOut) {
  const v = t.members.filter((m) => m.is_vet).length;
  console.log(`${pad(t.name, 8)}${t.members.length} people${v ? "" : "   (no vet)"}`);
  console.log("        " + t.tutorials.map((x) => `${x.id} ${x.when} ${x.location}`).join("   |   "));
  console.log("        " + t.members.map((m) => m.name + (m.is_vet ? "*" : "")).join(", "));
  console.log("");
}

const loads = {};
for (const p of perPerson) loads[p.tutorials.length] = (loads[p.tutorials.length] || 0) + 1;
const sizesOut = teamOut.map((t) => t.members.length);
console.log(`Teams: ${teamOut.length}, sizes ${Math.min(...sizesOut)}-${Math.max(...sizesOut)}`);
console.log(`Tutorials covered: ${groups.filter((g) => g.members.length).length} of ${T}`);
console.log("Presentations each: " + Object.keys(loads).sort().map((k) => `${k}: ${loads[k]} students`).join(",  "));
const all = groups.flatMap((g) => g.members.map((m) => m.got_choice));
console.log("Mean choice " + (all.reduce((a, b) => a + b, 0) / all.length).toFixed(2) + ".");
for (const w of wishes) {
  const t0 = perPerson.find((p) => p.name === w.names[0])?.team;
  const same = w.names.every((n) => perPerson.find((p) => p.name === n)?.team === t0);
  console.log(`Together (${w.names.join(", ")}): ` + (same ? "yes - " + t0 : "SPLIT"));
}
const novet = teamOut.filter((t) => !t.members.some((m) => m.is_vet));
if (novet.length) console.log("Teams with no vet: " + novet.map((t) => t.name).join(", "));
if (unseated.length) console.log("COULD NOT SEAT: " + unseated.map((s) => people[s].name).join(", "));
if (silent.length) console.log("Not placed - never submitted: " + silent.map((s) => s.name).join(", "));

writeFileSync(OUT, JSON.stringify({
  generated_at: new Date().toISOString(),
  teams: teamOut, groups, people: perPerson, loads,
  unseated: unseated.map((s) => people[s].name),
  not_submitted: silent.map((s) => s.name),
}, null, 2));
console.log(`\nWrote ${OUT}.`);
