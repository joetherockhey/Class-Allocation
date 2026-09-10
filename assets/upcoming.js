/**
 * "Upcoming tutorials" panel on the home page.
 *
 * The timetable has no dates, only a day and a time, so each tutorial is
 * treated as a weekly fixture and ordered by how soon it next comes round.
 * Everything is listed - the soonest first - so the panel scrolls through the
 * whole week rather than showing a fixed few.
 */
import { el, escapeHtml } from "./api.js";

const DAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

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

/** Minutes from now until this weekly fixture next runs. */
function until(when, now) {
  const day = DAY[String(when).split(" ")[0]];
  const mins = startMinutes(when);
  if (day === undefined || Number.isNaN(mins)) return Infinity;
  const nowMins = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
  let d = day * 1440 + mins - nowMins;
  if (d < -30) d += 7 * 1440;            // just started still counts as now
  return d;
}

const soon = (mins) => {
  if (mins < 0) return "on now";
  if (mins < 60) return "in " + Math.round(mins) + " min";
  if (mins < 24 * 60) return "in " + Math.round(mins / 60) + "h";
  const d = Math.round(mins / (24 * 60));
  return "in " + d + (d === 1 ? " day" : " days");
};

export async function initUpcoming() {
  const box = el("upcoming");
  if (!box) return;
  let plan;
  try {
    const r = await fetch("groups.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    plan = await r.json();
  } catch {
    box.innerHTML = '<p class="none">Groups have not been published yet.</p>';
    return;
  }

  const now = new Date();
  const rows = (plan.groups || [])
    .map((g) => ({ g, mins: until(g.when, now) }))
    .filter((x) => Number.isFinite(x.mins))
    .sort((a, b) => a.mins - b.mins);

  if (!rows.length) { box.innerHTML = '<p class="none">Nothing scheduled.</p>'; return; }

  box.innerHTML = rows.map(({ g, mins }, i) => `
    <li class="${i === 0 ? "next" : ""}">
      <div class="hd">
        <b>${escapeHtml(g.tutorial_id.replace(/^T/, "Tut "))}</b>
        <span class="in">${escapeHtml(soon(mins))}</span>
      </div>
      <div class="wh">${escapeHtml(g.when)}${g.location ? " &middot; " + escapeHtml(g.location) : ""}</div>
      <div class="ppl">${g.members.length
        ? g.members.map((m) => escapeHtml(m.name) + (m.is_vet ? '<span class="v">vet</span>' : "")).join(", ")
        : "<i>nobody yet</i>"}</div>
    </li>`).join("");
}
