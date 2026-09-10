/**
 * "Upcoming tutorials" panel on the home page.
 *
 * These tutorials run once, in a single week, not weekly. Each one is dated
 * from WEEK_START in config.js, so the countdowns are real - a Friday slot is
 * eight days away, not eight hours - and anything already past is marked done
 * and pushed to the bottom rather than reappearing as next week's.
 */
import { el, escapeHtml } from "./api.js";
import { WEEK_START } from "./config.js";

const OFFSET = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** "Wed 10-10:30am" -> minutes past midnight for the start. */
function startMinutes(when) {
  const time = String(when).split(" ").slice(1).join(" ");
  const [lhs, rhs = ""] = time.split(/[-–]/);
  const suffix = (/(am|pm)/i.exec(lhs) || /(am|pm)/i.exec(rhs) || [])[1];
  const hm = /(\d{1,2})(?::(\d{2}))?/.exec(lhs);
  if (!hm || !suffix) return NaN;
  let h = Number(hm[1]);
  const m = Number(hm[2] || 0);
  if (/pm/i.test(suffix) && h < 12) h += 12;
  if (/am/i.test(suffix) && h === 12) h = 0;
  return h * 60 + m;
}

/** The actual date and time this tutorial runs, or null if unparseable. */
function dateOf(when) {
  const day = OFFSET[String(when).split(" ")[0]];
  const mins = startMinutes(when);
  if (day === undefined || Number.isNaN(mins)) return null;
  const [y, mo, d] = String(WEEK_START).split("-").map(Number);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d);            // local midnight that Monday
  dt.setDate(dt.getDate() + day);
  dt.setMinutes(mins);
  return dt;
}

const dayLabel = (dt) =>
  dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function countdown(dt, now) {
  const mins = (dt - now) / 60000;
  if (mins < -30) return { text: "done", past: true };
  if (mins < 0) return { text: "on now", past: false };
  if (mins < 60) return { text: "in " + Math.round(mins) + " min", past: false };
  if (mins < 24 * 60) return { text: "in " + Math.round(mins / 60) + "h", past: false };
  const d = Math.round(mins / (24 * 60));
  return { text: "in " + d + (d === 1 ? " day" : " days"), past: false };
}

export async function initUpcoming() {
  const box = el("upcoming");
  if (!box) return;
  let plan;
  try {
    const r = await fetch("groups.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    plan = await r.json();
  } catch {
    box.innerHTML = '<li class="none">Groups have not been published yet.</li>';
    return;
  }

  const now = new Date();
  const rows = (plan.groups || [])
    .map((g) => ({ g, dt: dateOf(g.when) }))
    .filter((x) => x.dt)
    .map((x) => ({ ...x, c: countdown(x.dt, now) }))
    // still to come first, in order; anything finished collects at the bottom
    .sort((a, b) => (a.c.past - b.c.past) || (a.dt - b.dt));

  if (!rows.length) { box.innerHTML = '<li class="none">Nothing scheduled.</li>'; return; }

  const firstUpcoming = rows.findIndex((x) => !x.c.past);
  box.innerHTML = rows.map(({ g, dt, c }, i) => `
    <li class="${i === firstUpcoming ? "next" : ""}${c.past ? " past" : ""}">
      <div class="hd">
        <b>${escapeHtml(g.tutorial_id.replace(/^T/, "Tut "))}</b>
        <span class="in">${escapeHtml(c.text)}</span>
      </div>
      <div class="wh">${escapeHtml(dayLabel(dt))} &middot; ${escapeHtml(
        String(g.when).split(" ").slice(1).join(" "))}${
        g.location ? " &middot; " + escapeHtml(g.location) : ""}</div>
      <div class="ppl">${g.members.length
        ? g.members.map((m) => escapeHtml(m.name) + (m.is_vet ? '<span class="v">vet</span>' : "")).join(", ")
        : "<i>nobody yet</i>"}</div>
    </li>`).join("");
}
