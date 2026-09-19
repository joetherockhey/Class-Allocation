/**
 * "The week's tutorials" panel beside the feed on the home page.
 *
 * The week has run, so there is no countdown here any more - it is a record.
 * Every tutorial in chronological order, Monday to Friday, with who presented,
 * where and when, so the list scrolls straight down the week. Dates come from
 * WEEK_START in config.js; the tutorials ran once, they are not weekly.
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

/** The date and time this tutorial ran, or null if unparseable. */
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
  dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });

export async function initWeek() {
  const box = el("week");
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

  // A tutorial whose time will not parse goes to the bottom under its raw
  // "when" rather than being dropped - a group missing from the record is the
  // one failure nobody would notice.
  const rows = (plan.groups || [])
    .map((g) => ({ g, dt: dateOf(g.when) }))
    .sort((a, b) => (!a.dt - !b.dt) || (a.dt - b.dt));

  if (!rows.length) { box.innerHTML = '<li class="none">Nothing to show.</li>'; return; }

  let day = "";
  box.innerHTML = rows.map(({ g, dt }) => {
    const label = dt ? dayLabel(dt) : "Time unclear";
    const head = label === day ? "" : `<li class="wkday">${escapeHtml(label)}</li>`;
    day = label;
    return head + `
    <li>
      <div class="hd">
        <b>${escapeHtml(g.tutorial_id.replace(/^T/, "Tut "))}</b>
        <span class="in">${escapeHtml(String(g.when).split(" ").slice(1).join(" "))}</span>
      </div>
      <div class="wh">${g.location ? escapeHtml(g.location) : ""}</div>
      <div class="ppl">${g.members.length
        ? g.members.map((m) => escapeHtml(m.name) + (m.is_vet ? '<span class="v">vet</span>' : "")).join(", ")
        : "<i>nobody</i>"}</div>
    </li>`;
  }).join("");
}
