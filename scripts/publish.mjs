#!/usr/bin/env node
/**
 * Push allocation.json into Supabase so students can see their group.
 *
 *   npm run publish              # upload groups, keep them hidden (dry preview)
 *   npm run publish -- --live    # upload and reveal to students
 *   npm run publish -- --hide    # hide results again
 *   npm run publish -- --close   # stop accepting new preferences
 *   npm run publish -- --open    # accept preferences again
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile(".env"); } catch { /* fall back to real env vars */ }

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. Copy .env.example to .env first.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const has = (f) => process.argv.includes(f);
const check = ({ error }) => { if (error) { console.error(error.message); process.exit(1); } };

if (has("--close")) {
  check(await db.from("settings").upsert({ key: "submissions_open", value: "false" }));
  console.log("Submissions closed.");
}
if (has("--open")) {
  check(await db.from("settings").upsert({ key: "submissions_open", value: "true" }));
  console.log("Submissions open.");
}
if (has("--hide")) {
  check(await db.from("settings").upsert({ key: "results_published", value: "false" }));
  console.log("Results hidden from students.");
  process.exit(0);
}

const file = process.argv.find((a) => a.endsWith(".json")) || "allocation.json";
let plan;
try {
  plan = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  if (has("--close") || has("--open")) process.exit(0);
  console.error(`Could not read ${file}: ${e.message}\nRun "npm run allocate" first.`);
  process.exit(1);
}

const rows = plan.groups.flatMap((g) =>
  g.members.map((m) => ({
    student_id: m.id,
    group_no: g.group_no,
    group_name: g.group_name || "Group " + g.group_no,
    tutorial_id: g.tutorial_id,
  })));

check(await db.from("allocations").delete().neq("group_no", -1));
check(await db.from("allocations").insert(rows));
console.log(`Uploaded ${rows.length} placements across ${plan.groups.length} groups.`);

if (has("--live")) {
  check(await db.from("settings").upsert({ key: "results_published", value: "true" }));
  console.log("Results are now visible to students.");
} else {
  console.log('Results are uploaded but hidden. Re-run with --live when you are ready.');
}
