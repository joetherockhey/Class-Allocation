#!/usr/bin/env node
/**
 * Record a student's preferences on their behalf, in the order given.
 * Useful when someone tells you their availability rather than using the site.
 *
 *   npm run set-prefs -- "Callum Franzman" T23 T24
 *   npm run set-prefs -- "Callum Franzman" --clear
 *
 * Ignores the per-student minimum: this is you entering it deliberately, not a
 * student rushing the form. It writes exactly what you pass, in that order.
 */
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile(".env"); } catch { /* fall back to real env vars */ }

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. Copy .env.example to .env first.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const check = ({ error }) => { if (error) { console.error(error.message); process.exit(1); } };

const args = process.argv.slice(2);
const name = args.shift();
const clear = args.includes("--clear");
const ids = args.filter((a) => !a.startsWith("--"));

if (!name || (!ids.length && !clear)) {
  console.error('Usage: npm run set-prefs -- "Full Name" T23 T24   |   -- "Full Name" --clear');
  process.exit(1);
}

/* ------------------------------------------------------------ find them */
const { data: students } = await db.from("students").select("id,name,is_vet");
const student = (students || []).find((s) => s.name.toLowerCase() === name.toLowerCase());
if (!student) {
  const near = (students || []).filter((s) =>
    s.name.toLowerCase().includes(name.toLowerCase().split(" ")[0]));
  console.error(`No student called "${name}".` +
    (near.length ? " Did you mean: " + near.map((s) => s.name).join(", ") + "?" : ""));
  process.exit(1);
}

/* -------------------------------------------------------- validate slots */
const { data: tutorials } = await db.from("tutorials").select("id,when_text,location,label");
const byId = new Map((tutorials || []).map((t) => [t.id.toUpperCase(), t]));
const unknown = ids.filter((id) => !byId.has(id.toUpperCase()));
if (unknown.length) {
  console.error("Unknown tutorial id(s): " + unknown.join(", "));
  console.error("Valid ids: " + [...byId.keys()].join(" "));
  process.exit(1);
}
const dupes = ids.filter((id, i) => ids.findIndex((x) => x.toUpperCase() === id.toUpperCase()) !== i);
if (dupes.length) {
  console.error("Repeated tutorial id(s): " + dupes.join(", "));
  process.exit(1);
}

/* ------------------------------------------------------------------ write */
check(await db.from("availability").delete().eq("student_id", student.id));

if (clear && !ids.length) {
  check(await db.from("submissions").delete().eq("student_id", student.id));
  console.log(`Cleared everything for ${student.name}. They now show as not submitted.`);
  process.exit(0);
}

const rows = ids.map((id, i) => ({
  student_id: student.id,
  tutorial_id: byId.get(id.toUpperCase()).id,
  rank: i + 1,
}));
check(await db.from("availability").insert(rows));
check(await db.from("submissions").upsert({
  student_id: student.id,
  submitted_at: new Date().toISOString(),
  note: "entered by tutor",
}));

console.log(`${student.name}${student.is_vet ? " (vet)" : ""} — ${rows.length} preference(s):`);
rows.forEach((r, i) => {
  const t = byId.get(ids[i].toUpperCase());
  console.log(`  ${i + 1}. ${t.id.padEnd(5)} ${t.when_text.padEnd(18)} ${t.location}`);
});

/* -------------------------------------------------------------- read back */
const { data: back } = await db.from("availability")
  .select("tutorial_id,rank").eq("student_id", student.id).order("rank");
const ok = (back || []).map((r) => r.tutorial_id).join(",") === rows.map((r) => r.tutorial_id).join(",");
console.log(ok ? "Verified in the database." : "WARNING: read-back did not match.");
