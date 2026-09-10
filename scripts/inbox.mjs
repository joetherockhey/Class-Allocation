#!/usr/bin/env node
/**
 * Read the messages students have sent through the "Message Joe" box, using the
 * secret key - so this works whether or not reads are open to the public key.
 *
 *   npm run inbox              # unhandled messages
 *   npm run inbox -- --all     # including ones already marked done
 *   npm run inbox -- --done=<id>   # mark one as handled
 */
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile(".env"); } catch { /* fall back to real env vars */ }
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env"); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const done = process.argv.find((a) => a.startsWith("--done="));
if (done) {
  const id = done.slice("--done=".length);
  const { error } = await db.from("tutor_messages").update({ handled: true }).eq("id", id);
  console.log(error ? "Failed: " + error.message : "Marked handled.");
  process.exit(error ? 1 : 0);
}

let q = db.from("tutor_messages").select("*").order("created_at", { ascending: false });
if (!process.argv.includes("--all")) q = q.eq("handled", false);
const { data, error } = await q;
if (error) { console.error(error.message); process.exit(1); }
if (!data.length) { console.log("No messages."); process.exit(0); }

for (const m of data) {
  console.log("\n" + "-".repeat(66));
  console.log(`${m.name}   ${new Date(m.created_at).toLocaleString("en-GB",
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${m.handled ? "   [handled]" : ""}`);
  console.log(m.body);
  console.log(`mark done:  npm run inbox -- --done=${m.id}`);
}
console.log("\n" + data.length + " message(s).");
