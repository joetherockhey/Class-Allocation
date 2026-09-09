import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const db = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

/** Throw on a Supabase error, otherwise hand back the rows. */
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export const el = (id) => document.getElementById(id);

export function setupBanner(node) {
  if (configured) return true;
  node.className = "notice warn";
  node.textContent =
    "Not connected yet. Add your Supabase project URL and anon key to assets/config.js, " +
    "then run supabase/schema.sql and scripts/seed.mjs. See README.md.";
  node.classList.remove("hidden");
  return false;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
