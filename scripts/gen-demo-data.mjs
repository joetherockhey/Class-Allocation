#!/usr/bin/env node
// Regenerate assets/demo-data.js from the CSVs, so the site is clickable
// before Supabase is configured.  Run after editing data/*.csv.
import { readFileSync, writeFileSync } from "node:fs";

const rd = (p) => {
  const [h, ...r] = readFileSync(p, "utf8").trim().split(/\r?\n/);
  const k = h.split(",").map((s) => s.trim().toLowerCase());
  return r.map((l) => Object.fromEntries(k.map((kk, i) => [kk, (l.split(",")[i] || "").trim()])));
};
const students = rd("data/roster.csv").map((r, i) => ({
  id: "s" + i, name: r.name,
  is_vet: ["yes", "true", "1", "y"].includes((r.is_vet || "").toLowerCase()),
}));
const tutorials = rd("data/tutorials.csv").map((t) => ({
  id: t.id, label: t.label, when_text: t.when, location: t.location || "", sort_order: +t.sort_order,
}));
writeFileSync("assets/demo-data.js",
  "// Generated from data/*.csv by scripts/gen-demo-data.mjs - used only when Supabase is not configured.\n" +
  "export const DEMO_STUDENTS = " + JSON.stringify(students) + ";\n" +
  "export const DEMO_TUTORIALS = " + JSON.stringify(tutorials) + ";\n");
console.log(`demo-data.js: ${students.length} students, ${tutorials.length} slots`);
