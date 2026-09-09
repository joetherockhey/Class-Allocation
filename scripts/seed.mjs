#!/usr/bin/env node
/**
 * Load data/roster.csv and data/tutorials.csv into Supabase.
 * Uses the service-role key from .env, so run it locally only.
 *
 *   npm run seed              # add/update roster + tutorials
 *   npm run seed -- --reset   # also wipe preferences, submissions, allocations
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
const reset = process.argv.includes("--reset");

/* Minimal CSV reader: handles quoted fields and embedded commas. */
function readCsv(path) {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "").trim();
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  row.push(field); rows.push(row);
  const head = rows.shift().map((h) => h.trim().toLowerCase());
  return rows
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const truthy = (v) => ["1", "true", "yes", "y", "vet"].includes(String(v).toLowerCase());

const check = ({ error }) => { if (error) { console.error(error.message); process.exit(1); } };

/* ------------------------------------------------------------- tutorials */
const tutorials = readCsv("data/tutorials.csv").map((r, i) => ({
  id: r.id || "T" + String(i + 1).padStart(2, "0"),
  label: r.label || "Tutorial " + (i + 1),
  when_text: r.when || r.when_text || "",
  location: r.location || "",
  sort_order: Number(r.sort_order || i + 1),
}));
check(await db.from("tutorials").upsert(tutorials, { onConflict: "id" }));
console.log(`Tutorials: ${tutorials.length} loaded.`);

/* ---------------------------------------------------------------- roster */
const roster = readCsv("data/roster.csv")
  .map((r) => ({ name: (r.name || "").trim(), is_vet: truthy(r.is_vet || r.vet) }))
  .filter((r) => r.name);

const dupes = roster.map((r) => r.name).filter((n, i, a) => a.indexOf(n) !== i);
if (dupes.length) {
  console.error("Duplicate names in roster.csv (names must be unique):", [...new Set(dupes)].join(", "));
  process.exit(1);
}
check(await db.from("students").upsert(roster, { onConflict: "name" }));
console.log(`Students: ${roster.length} loaded (${roster.filter((r) => r.is_vet).length} vets).`);

/* Remove anyone who is no longer on the roster. */
const { data: existing } = await db.from("students").select("id,name");
const keep = new Set(roster.map((r) => r.name));
const gone = (existing || []).filter((s) => !keep.has(s.name));
if (gone.length) {
  check(await db.from("students").delete().in("id", gone.map((s) => s.id)));
  console.log(`Removed ${gone.length} student(s) no longer on the roster: ${gone.map((s) => s.name).join(", ")}`);
}

/* ----------------------------------------------------------------- reset */
if (reset) {
  check(await db.from("allocations").delete().neq("group_no", -1));
  check(await db.from("submissions").delete().neq("student_id", "00000000-0000-0000-0000-000000000000"));
  check(await db.from("availability").delete().neq("rank", -1));
  check(await db.from("settings").upsert({ key: "results_published", value: "false" }));
  console.log("Reset: cleared preferences, submissions and allocations.");
}

console.log("Done.");
