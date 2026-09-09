#!/usr/bin/env node
/**
 * Build a fake allocation-input.json from the CSVs, so the allocator can be
 * tested before anyone has actually submitted. Not used in production.
 *
 *   npm run demo && node scripts/allocate.mjs demo-input.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const csv = (p) => {
  const [head, ...rows] = readFileSync(p, "utf8").trim().split(/\r?\n/);
  const keys = head.split(",").map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r.split(",")[i] || "").trim()])));
};

let s = 12345;
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const tutorials = csv("data/tutorials.csv").map((t) => ({
  id: t.id, label: t.label, when: t.when, location: t.location || "",
}));

const students = csv("data/roster.csv").map((r, i) => {
  // Each student can make 4-11 slots, ordered randomly. Deliberately spiky:
  // some people are very constrained, which is what makes allocation hard.
  const howMany = 4 + Math.floor(rnd() * 8);
  const shuffled = [...tutorials].sort(() => rnd() - 0.5);
  return {
    id: "demo-" + i,
    name: r.name,
    is_vet: ["yes", "true", "1", "y"].includes((r.is_vet || "").toLowerCase()),
    submitted: true,
    preferences: shuffled.slice(0, howMany).map((t) => t.id),
  };
});

writeFileSync("demo-input.json", JSON.stringify(
  { exported_at: new Date().toISOString(), tutorials, students }, null, 2));
console.log(`demo-input.json: ${students.length} students, ${tutorials.length} slots, ` +
  `${students.filter((x) => x.is_vet).length} vets.`);
