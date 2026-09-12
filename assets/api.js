/**
 * Data access. Two interchangeable backends:
 *   - "supabase" once assets/config.js has a URL + anon key (the real thing)
 *   - "demo"     otherwise: everything lives in this browser's localStorage,
 *                so the site is fully clickable with zero setup.
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { DEMO_STUDENTS, DEMO_TUTORIALS } from "./demo-data.js";

export const mode = SUPABASE_URL && SUPABASE_ANON_KEY ? "supabase" : "demo";

export const db = mode === "supabase"
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

/** A client that sends the caller's edit token as a header. The update policy
 *  on posts checks it, and the token column cannot be read back, so holding a
 *  post's token is the only way to change it. */
export function editingClient(token) {
  if (mode !== "supabase") return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { "x-edit-token": token } },
  });
}

/** True when there is a real backend behind the page. */
export const ready = () => mode === "supabase";

const up = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

/* ------------------------------------------------------------------ demo */
const DEMO_KEY = "tutgroups.demo.v1";
const demoLoad = () => {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || {}; } catch { return {}; }
};
const demoSave = (s) => {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch { /* private mode */ }
};

/* ------------------------------------------------------------------- api */
export async function loadCore() {
  if (mode === "demo") {
    const s = demoLoad();
    return {
      tutorials: DEMO_TUTORIALS,
      students: [...DEMO_STUDENTS].sort((a, b) => a.name.localeCompare(b.name)),
      settings: s.settings || {},
      submitted: new Set(Object.keys(s.prefs || {})),
    };
  }
  const [tutorials, students, settingsRows, subs] = await Promise.all([
    db.from("tutorials").select("*").order("sort_order").then(up),
    db.from("students").select("*").order("name").then(up),
    db.from("settings").select("*").then(up),
    db.from("submissions").select("student_id").then(up),
  ]);
  return {
    tutorials,
    students,
    settings: Object.fromEntries(settingsRows.map((r) => [r.key, r.value])),
    submitted: new Set(subs.map((r) => r.student_id)),
  };
}

export async function getPrefs(studentId) {
  if (mode === "demo") return (demoLoad().prefs || {})[studentId] || [];
  const rows = up(await db.from("availability").select("tutorial_id,rank")
    .eq("student_id", studentId).order("rank"));
  return rows.map((r) => r.tutorial_id);
}

export async function savePrefs(studentId, ids) {
  if (mode === "demo") {
    const s = demoLoad();
    s.prefs = s.prefs || {};
    s.prefs[studentId] = ids;
    demoSave(s);
    return;
  }
  up(await db.from("availability").delete().eq("student_id", studentId));
  if (ids.length) {
    up(await db.from("availability").insert(
      ids.map((id, i) => ({ student_id: studentId, tutorial_id: id, rank: i + 1 }))));
  }
  up(await db.from("submissions")
    .upsert({ student_id: studentId, submitted_at: new Date().toISOString() }));
}

export async function loadAllocations() {
  if (mode === "demo") return demoLoad().allocations || [];
  return up(await db.from("allocations").select("*"));
}

/** Everything the dashboard needs, including each student's ranked list. */
export async function loadAdmin() {
  const core = await loadCore();
  if (mode === "demo") {
    const prefs = demoLoad().prefs || {};
    return {
      ...core,
      avail: Object.entries(prefs).flatMap(([sid, ids]) =>
        ids.map((tid, i) => ({ student_id: sid, tutorial_id: tid, rank: i + 1 }))),
      allocs: demoLoad().allocations || [],
    };
  }
  const [avail, allocs] = await Promise.all([
    db.from("availability").select("*").then(up),
    db.from("allocations").select("*").then(up),
  ]);
  return { ...core, avail, allocs };
}

/** Messages students sent through the "Message Joe" box. Returns {data} or
 *  {error} rather than throwing, since the table may not exist yet and that is
 *  a normal state, not a failure. */
export async function tutorMessages() {
  if (mode === "demo") return { data: [] };
  const { data, error } = await db.from("tutor_messages").select("*")
    .order("created_at", { ascending: false });
  return error ? { error: error.message } : { data };
}

/** Anyone who set preferences after the cutoff - i.e. after the groups were
 *  worked out - with what they picked and when. */
export async function latePreferences() {
  if (mode === "demo") return { data: [] };
  const [setting, subs, studs, avail, tuts] = await Promise.all([
    db.from("settings").select("*").eq("key", "prefs_cutoff").maybeSingle(),
    db.from("submissions").select("*"),
    db.from("students").select("*"),
    db.from("availability").select("*"),
    db.from("tutorials").select("*").order("sort_order"),
  ]);
  const cutoff = setting.data && setting.data.value ? new Date(setting.data.value) : null;
  if (!cutoff) return { data: [] };
  const byId = new Map((studs.data || []).map((x) => [x.id, x]));
  const tutById = new Map((tuts.data || []).map((t) => [t.id, t]));
  return {
    data: (subs.data || [])
      .filter((x) => new Date(x.submitted_at) > cutoff)
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
      .map((x) => ({
        name: (byId.get(x.student_id) || {}).name || "(unknown)",
        is_vet: Boolean((byId.get(x.student_id) || {}).is_vet),
        at: x.submitted_at,
        note: x.note || "",
        picks: (avail.data || [])
          .filter((a) => a.student_id === x.student_id)
          .sort((a, b) => a.rank - b.rank)
          .map((a) => ({
            id: a.tutorial_id,
            when: (tutById.get(a.tutorial_id) || {}).when_text || a.tutorial_id,
          })),
      })),
  };
}

/** Tick a student message off, or put it back. */
export async function markHandled(id, handled) {
  if (mode === "demo") return {};
  // .select() so a row comes back: without it RLS refuses the write with a
  // 200 and an empty body, and the tick silently undoes itself on refresh.
  const { data, error } = await db.from("tutor_messages").update({ handled }).eq("id", id).select();
  if (error) return { error: error.message };
  return data.length ? {} : { error: "denied - run supabase/handle-messages.sql" };
}

/* ---------------------------------------------------------------- shared */
export const el = (id) => document.getElementById(id);

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Picks made while the site was still in preview mode live only in this
 *  browser and were never sent to the database. If someone answered during
 *  that window, hand their choices back so they can submit them for real
 *  rather than silently losing them. */
export function strandedPrefs(studentName) {
  if (mode !== "supabase") return [];
  // Preview mode keyed prefs by the generated demo id ("s0"), while Supabase
  // uses a uuid — so bridge the two id spaces by name. Tutorial ids ("T11")
  // are identical in both, so the picks themselves carry over unchanged.
  const demoMe = DEMO_STUDENTS.find((s) => s.name === studentName);
  if (!demoMe) return [];
  const ids = (demoLoad().prefs || {})[demoMe.id] || [];
  return Array.isArray(ids) ? ids : [];
}

export function clearStranded() {
  try { localStorage.removeItem(DEMO_KEY); } catch { /* nothing to clear */ }
}

/** Banner text explaining which backend is live. */
export function backendNotice() {
  return mode === "supabase" ? null :
    "Preview mode — answers are saved in this browser only, so you can click " +
    "through the whole flow. Add your Supabase keys to assets/config.js to go live.";
}
