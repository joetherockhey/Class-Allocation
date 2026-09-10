#!/usr/bin/env node
/**
 * Switch which saved plan the site shows.
 *
 *   npm run use-plan -- og       # the arrangement before the clash fix
 *   npm run use-plan -- idea1    # nobody in two tutorials at once
 *   npm run use-plan             # list what is saved and which is live
 *
 * Copies the chosen plan over groups.json, restores its pin set, and rebuilds
 * groups.html. Commit and push afterwards to put it on the site.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const which = process.argv[2];
const saved = readdirSync("plans").filter((f) => f.endsWith("-plan.json"))
  .map((f) => f.replace("-plan.json", ""));

const summarise = (file) => {
  const g = JSON.parse(readFileSync(file, "utf8"));
  const load = new Map();
  for (const x of g.groups) for (const m of x.members) load.set(m.name, (load.get(m.name) || 0) + 1);
  const byTime = new Map();
  for (const x of g.groups) { if (!byTime.has(x.when)) byTime.set(x.when, []); byTime.get(x.when).push(x); }
  let clashes = 0;
  for (const [, list] of byTime) {
    if (list.length < 2) continue;
    const c = new Map();
    for (const x of list) for (const m of x.members) c.set(m.name, (c.get(m.name) || 0) + 1);
    clashes += [...c.values()].filter((n) => n > 1).length;
  }
  const sizes = g.groups.map((x) => x.members.length);
  return `${g.groups.reduce((n, x) => n + x.members.length, 0)} slots, sizes ${Math.min(...sizes)}-${Math.max(...sizes)}, ${clashes} double-booked`;
};

if (!which) {
  console.log("Saved plans:");
  for (const s of saved) console.log(`   ${s.padEnd(8)} ${summarise(`plans/${s}-plan.json`)}`);
  console.log(`\nLive now:  ${summarise("groups.json")}`);
  console.log("\nSwitch with:  npm run use-plan -- " + saved.join(" | "));
  process.exit(0);
}

const file = `plans/${which}-plan.json`;
if (!existsSync(file)) {
  console.error(`No plan called "${which}". Available: ${saved.join(", ")}`);
  process.exit(1);
}
writeFileSync("groups.json", readFileSync(file));
const pinFile = `plans/${which}-pins.json`;
if (existsSync(pinFile)) {
  writeFileSync("data/pins.json", readFileSync(pinFile));
  console.log(`Restored ${pinFile} over data/pins.json`);
}
console.log(`groups.json <- ${file}  (${summarise(file)})`);
execFileSync(process.execPath, ["scripts/gen-groups-page.mjs", "groups.json", "groups.html"],
  { stdio: "inherit" });
console.log("\nCommit and push to put it on the site.");
