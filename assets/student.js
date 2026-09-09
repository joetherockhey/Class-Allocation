import { loadCore, getPrefs, savePrefs, loadAllocations, el, escapeHtml, backendNotice,
  strandedPrefs, clearStranded } from "./api.js";
import { COURSE_TITLE, INTRO, MIN_PICKS } from "./config.js";

const LS_KEY = "tutgroups.studentId";

let tutorials = [], students = [], submitted = new Set(), settings = {};
let me = null;
let prefs = [];            // ordered tutorial ids
let dirty = false;

init().catch((e) => {
  const b = el("banner");
  b.className = "notice warn";
  b.textContent = "Could not load: " + e.message;
  b.classList.remove("hidden");
});

async function init() {
  el("courseTitle").textContent = COURSE_TITLE;
  document.title = COURSE_TITLE;
  el("intro").textContent = INTRO;

  ({ tutorials, students, settings, submitted } = await loadCore());

  const note = [backendNotice(), settings.deadline_text].filter(Boolean).join(" ");
  if (note) {
    const b = el("banner");
    b.className = "notice";
    b.textContent = note;
    b.classList.remove("hidden");
  }

  el("nameSearch").addEventListener("input", renderNameGrid);
  el("switchBtn").addEventListener("click", signOut);
  el("saveBtn").addEventListener("click", save);
  el("sortBtn").addEventListener("click", () => {
    prefs.sort((a, b) => order(a) - order(b));
    dirty = true;
    renderPrefs();
  });
  el("clearBtn").addEventListener("click", () => {
    if (!prefs.length || !confirm("Remove everything you have picked?")) return;
    prefs = [];
    dirty = true;
    renderAll();
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  const known = students.find((s) => s.id === localStorage.getItem(LS_KEY));
  if (known) await signIn(known);
  else showNamePicker();
}

const tut = (id) => tutorials.find((t) => t.id === id);
const order = (id) => tut(id)?.sort_order ?? 0;

/** Labels are generated as "Tut 12 · Tue 12-2pm · BHB 2200", so split them
 *  back into the activity code, the tutorial's real length, and the room.
 *  Falls back to whatever is there if the shape ever changes. */
function slotInfo(t) {
  const parts = String(t.label || "").split(" · ");
  const day = (t.when_text || "").split(" ")[0];
  let full = parts[1] || "";
  // Strip the leading day off "Mon 10am-12pm" without building a regex from
  // data - escaping that through the build has bitten us once already.
  if (day && full.slice(0, day.length) === day) full = full.slice(day.length).trim();
  return {
    code: parts[0] || t.id,
    full,                                  // "10am-12pm" - the whole tutorial
    room: t.location || parts[2] || "",
  };
}


/* ------------------------------------------------------------ name picker */
function showNamePicker() {
  el("stepName").classList.remove("hidden");
  el("stepPrefs").classList.add("hidden");
  el("stepResult").classList.add("hidden");
  el("whoami").classList.add("hidden");
  el("switchBtn").classList.add("hidden");
  renderNameGrid();
  el("nameSearch").focus();
}

function renderNameGrid() {
  const q = el("nameSearch").value.trim().toLowerCase();
  const list = students.filter((s) => !q || s.name.toLowerCase().includes(q));
  const grid = el("nameGrid");
  grid.innerHTML = "";
  if (!list.length) {
    grid.innerHTML = '<p class="sub">No name matches that. Ask the tutor to add you.</p>';
    return;
  }
  for (const s of list) {
    const b = document.createElement("button");
    b.className = "namebtn" + (submitted.has(s.id) ? " done" : "");
    b.innerHTML = '<span class="dot"></span><span class="who">' + escapeHtml(s.name) + "</span>";
    b.onclick = () => signIn(s);
    grid.appendChild(b);
  }
}

async function signIn(student) {
  me = student;
  localStorage.setItem(LS_KEY, student.id);
  prefs = (await getPrefs(student.id)).filter((id) => tut(id));
  dirty = false;

  // Rescue anything chosen while the site was still in preview mode.
  let rescued = false;
  if (!prefs.length) {
    const stray = strandedPrefs(student.name).filter((id) => tut(id));
    if (stray.length) { prefs = stray; dirty = true; rescued = true; }
  }

  el("whoami").textContent = student.name + (student.is_vet ? " · vet" : "");
  el("whoami").classList.remove("hidden");
  el("switchBtn").classList.remove("hidden");
  el("stepName").classList.add("hidden");

  if (settings.results_published === "true") { await showResult(); return; }

  const open = settings.submissions_open !== "false";
  el("stepPrefs").classList.remove("hidden");
  el("saveMsg").innerHTML = !open ? "Submissions are closed."
    : rescued ? '<span class="badge warn">Not submitted yet</span> These are the times you '
        + "picked earlier, before the site was connected. Press submit to save them properly."
    : submitted.has(student.id) ? "You have already submitted — press submit again to update."
    : "";
  renderAll();
}

function signOut() {
  if (dirty && !confirm("You have unsaved changes. Leave anyway?")) return;
  localStorage.removeItem(LS_KEY);
  me = null; prefs = []; dirty = false;
  el("nameSearch").value = "";
  showNamePicker();
}

/* ------------------------------------------------------------- week grid */
/** Split "Mon 9-10am" into a day and a time: first word is the day, the rest
 *  is the time. Deliberately format-agnostic so real timetable text still
 *  grids up. Returns null when there is no "<word> <rest>" to split, and the
 *  caller falls back to a plain list. */
function parseSlot(t) {
  const m = /^\s*([A-Za-z]{3,9})\s+(\S.*)$/.exec(t.when_text || "");
  return m ? { day: m[1], time: m[2].trim() } : null;
}

function renderAll() { renderGrid(); renderPrefs(); }

/** Minutes past midnight for the start of a label like "8-10am",
 *  "10am-12pm" or "11:30am-1:30pm". A start with no am/pm borrows the
 *  suffix from the end time ("12-2pm" starts at noon). NaN if unparseable,
 *  in which case rows keep their sort_order sequence instead. */
function startMinutes(label) {
  const [lhs, rhs = ""] = String(label).split(/[-–]/);
  const suffix = (/(am|pm)/i.exec(lhs) || /(am|pm)/i.exec(rhs) || [])[1];
  const hm = /(\d{1,2})(?::(\d{2}))?/.exec(lhs);
  if (!hm || !suffix) return NaN;
  let h = Number(hm[1]);
  const m = Number(hm[2] || 0);
  if (/pm/i.test(suffix) && h < 12) h += 12;
  if (/am/i.test(suffix) && h === 12) h = 0;
  return h * 60 + m;
}

/** Minutes past midnight -> "11:30am" / "12pm". */
function clockLabel(v) {
  const h = Math.floor(v / 60), m = v % 60;
  const suffix = h < 12 ? "am" : "pm";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? hh + ":" + String(m).padStart(2, "0") + suffix : hh + suffix;
}

function renderGrid() {
  const wrap = el("gridWrap");
  const parsed = tutorials.map((t) => ({ t, p: parseSlot(t) }));

  if (parsed.some((x) => !x.p)) { renderFlatList(wrap, parsed); return; }

  const days = [];
  for (const { p } of parsed) if (!days.includes(p.day)) days.push(p.day);
  if (days.length > 7) { renderFlatList(wrap, parsed); return; }

  for (const x of parsed) x.min = startMinutes(x.p.time);
  const timed = parsed.every((x) => !Number.isNaN(x.min));

  // Continuous hourly axis from the first slot to the last, plus any half-hour
  // that an actual tutorial starts on. So a gap in the timetable reads as a gap
  // (12pm no longer sits directly above 2pm) without 12 blank half-hour rows.
  let rows;
  if (timed) {
    const starts = parsed.map((x) => x.min);
    const lo = Math.floor(Math.min(...starts) / 60) * 60;
    const hi = Math.ceil(Math.max(...starts) / 60) * 60;
    const marks = new Set(starts);
    for (let v = lo; v <= hi; v += 60) marks.add(v);
    rows = [...marks].sort((a, b) => a - b).map((v) => ({ key: v, label: clockLabel(v) }));
  } else {
    const seen = [];
    for (const { p } of parsed) if (!seen.includes(p.time)) seen.push(p.time);
    rows = seen.map((t) => ({ key: t, label: t }));
  }

  const cellOf = new Map();
  for (const x of parsed) {
    const key = x.p.day + "|" + (timed ? x.min : x.p.time);
    if (!cellOf.has(key)) cellOf.set(key, []);
    cellOf.get(key).push(x.t);
  }

  let html = '<div class="scroll-x"><table class="weekgrid">' +
    '<colgroup><col class="timecol">' +
    '<col span="' + days.length + '"></colgroup>' +
    "<thead><tr><th></th>";
  for (const d of days) {
    html += '<th><button class="tiny daybtn" data-day="' + escapeHtml(d) + '">' +
      escapeHtml(d) + "</button></th>";
  }
  html += "</tr></thead><tbody>";

  for (const row of rows) {
    const cells = days.map((d) => cellOf.get(d + "|" + row.key) || []);
    const bare = cells.every((c) => !c.length);
    html += '<tr class="' + (bare ? "bare" : "") + '"><th>' + escapeHtml(row.label) + "</th>";
    for (const here of cells) {
      html += "<td>" + here.map((t) => {
        const at = prefs.indexOf(t.id);
        const i = slotInfo(t);
        return '<button class="slot' + (at >= 0 ? " on" : "") + '" data-id="' +
          escapeHtml(t.id) + '" title="' + escapeHtml(t.label) + '">' +
          (at >= 0 ? '<span class="pin">' + (at + 1) + "</span>" : "") +
          "<b>" + escapeHtml(i.code) + "</b>" +
          (i.full ? '<span class="full">(' + escapeHtml(i.full) + ")</span>" : "") +
          (i.room ? '<span class="room">' + escapeHtml(i.room) + "</span>" : "") +
          "</button>";
      }).join("") + "</td>";
    }
    html += "</tr>";
  }
  html += "</tbody></table></div>";

  // Phones get a day-by-day list instead of a five-column table. Both are
  // rendered and CSS shows one, so a selection made in either stays in step.
  let day = '<div class="dayview">';
  for (const d of days) {
    const mine = parsed.filter((x) => x.p.day === d)
      .sort((a, b) => (a.min || 0) - (b.min || 0));
    if (!mine.length) continue;
    const allOn = mine.every((x) => prefs.includes(x.t.id));
    day += '<div class="daysec"><div class="dayhead"><h3>' + escapeHtml(d) + "</h3>" +
      '<button class="tiny daybtn" data-day="' + escapeHtml(d) + '">' +
      (allOn ? "Clear day" : "Select all") + "</button></div>";
    for (const x of mine) {
      const at = prefs.indexOf(x.t.id);
      const i = slotInfo(x.t);
      day += '<button class="slot dayslot' + (at >= 0 ? " on" : "") + '" data-id="' +
        escapeHtml(x.t.id) + '">' +
        '<span class="dtime">' + escapeHtml(clockLabel(x.min)) + "</span>" +
        '<span class="dmeta"><b>' + escapeHtml(i.code) + "</b>" +
        '<span class="room">' + escapeHtml(i.room) +
        (i.full ? " · " + escapeHtml(i.full) : "") + "</span></span>" +
        (at >= 0 ? '<span class="pin">' + (at + 1) + "</span>" : '<span class="tick">+</span>') +
        "</button>";
    }
    day += "</div>";
  }
  day += "</div>";

  wrap.innerHTML = '<div class="gridview">' + html + "</div>" + day;

  wrap.querySelectorAll("button.slot").forEach((b) => {
    b.onclick = () => toggle(b.dataset.id);
  });
  wrap.querySelectorAll("button.daybtn").forEach((b) => {
    b.onclick = () => toggleDay(b.dataset.day, parsed);
  });
}

function renderFlatList(wrap, parsed) {
  wrap.innerHTML = '<div class="namegrid">' + parsed.map(({ t }) => {
    const i = slotInfo(t);
    return '<button class="namebtn slotflat' + (prefs.includes(t.id) ? " on" : "") +
      '" data-id="' + escapeHtml(t.id) + '"><span class="who">' +
      escapeHtml(i.code) + " — " + escapeHtml(t.when_text) +
      (i.full ? " (" + escapeHtml(i.full) + ")" : "") + "</span></button>";
  }).join("") + "</div>";
  wrap.querySelectorAll("button[data-id]").forEach((b) => {
    b.onclick = () => toggle(b.dataset.id);
  });
}

function toggle(id) {
  const i = prefs.indexOf(id);
  if (i >= 0) prefs.splice(i, 1); else prefs.push(id);
  dirty = true;
  renderAll();
}

function toggleDay(day, parsed) {
  const ids = parsed.filter((x) => x.p && x.p.day === day).map((x) => x.t.id);
  const allOn = ids.every((id) => prefs.includes(id));
  if (allOn) prefs = prefs.filter((id) => !ids.includes(id));
  else for (const id of ids) if (!prefs.includes(id)) prefs.push(id);
  dirty = true;
  renderAll();
}

/* --------------------------------------------------------- ordered list */
function renderPrefs() {
  const list = el("prefList");
  list.innerHTML = "";
  prefs.forEach((id, i) => {
    const t = tut(id);
    if (t) list.appendChild(prefRow(t, i));
  });
  const short = Math.max(0, MIN_PICKS - prefs.length);
  el("prefCount").textContent = prefs.length + " picked";

  const open = settings.submissions_open !== "false";
  el("saveBtn").disabled = !open || short > 0;
  el("saveBtn").textContent = short
    ? "Pick " + short + " more"
    : "Submit " + prefs.length + " preference" + (prefs.length === 1 ? "" : "s");

  const need = el("needMore");
  if (!open) {                            // closed: the count is moot
    need.className = "notice hidden";
    need.textContent = "";
  } else if (short) {
    need.className = "notice warn";
    need.textContent = "Choose at least " + MIN_PICKS + " times — " + short +
      " to go. With fewer, there may be no slot your whole group can make.";
  } else {
    need.className = "notice ok";
    need.textContent = "That's enough to work with. Add more if you can — it "
      + "makes it likelier you get one near the top of your list.";
  }
}

function prefRow(t, i) {
  const d = document.createElement("div");
  d.className = "item";
  d.draggable = true;
  d.dataset.idx = String(i);
  d.innerHTML =
    '<span class="rank">' + (i + 1) + "</span>" +
    '<div class="meta"><b>' + escapeHtml(t.when_text) +
      (slotInfo(t).full ? " (" + escapeHtml(slotInfo(t).full) + ")" : "") +
      "</b><span>" + escapeHtml(slotInfo(t).code) +
      (slotInfo(t).room ? " · " + escapeHtml(slotInfo(t).room) : "") + "</span></div>" +
    '<div class="acts">' +
      '<button class="tiny" data-a="up" title="Move up"' + (i === 0 ? " disabled" : "") + ">▲</button>" +
      '<button class="tiny" data-a="down" title="Move down"' + (i === prefs.length - 1 ? " disabled" : "") + ">▼</button>" +
      '<button class="tiny" data-a="remove" title="Remove">✕</button>' +
    "</div><span class=\"grip\" title=\"Drag to reorder\">⠿</span>";
  d.querySelector('[data-a="up"]').onclick = () => move(i, i - 1);
  d.querySelector('[data-a="down"]').onclick = () => move(i, i + 1);
  d.querySelector('[data-a="remove"]').onclick = () => toggle(t.id);
  addDrag(d);
  return d;
}

function move(from, to) {
  if (to < 0 || to >= prefs.length) return;
  prefs.splice(to, 0, prefs.splice(from, 1)[0]);
  dirty = true;
  renderAll();
}

let dragFrom = null;
function addDrag(node) {
  node.addEventListener("dragstart", (e) => {
    dragFrom = Number(node.dataset.idx);
    node.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragFrom));
  });
  node.addEventListener("dragend", () => {
    node.classList.remove("dragging");
    dragFrom = null;
  });
  node.addEventListener("dragover", (e) => { e.preventDefault(); node.classList.add("over"); });
  node.addEventListener("dragleave", () => node.classList.remove("over"));
  node.addEventListener("drop", (e) => {
    e.preventDefault();
    node.classList.remove("over");
    const to = Number(node.dataset.idx);
    if (dragFrom !== null && dragFrom !== to) move(dragFrom, to);
  });
}

/* ------------------------------------------------------------------ save */
async function save() {
  if (prefs.length < MIN_PICKS) {         // the button is disabled, but be safe
    el("saveMsg").innerHTML =
      '<span class="badge warn">Not submitted</span> Please pick at least ' + MIN_PICKS + ".";
    return;
  }
  const btn = el("saveBtn");
  btn.disabled = true;
  el("saveMsg").textContent = "Saving…";
  try {
    await savePrefs(me.id, prefs);
    submitted.add(me.id);
    clearStranded();
    dirty = false;
    el("saveMsg").innerHTML =
      '<span class="badge ok">Saved</span> You can change this any time.';
  } catch (e) {
    el("saveMsg").innerHTML = '<span class="badge warn">Not saved</span> ' + escapeHtml(e.message);
  } finally {
    btn.disabled = false;
  }
}

/* --------------------------------------------------------------- results */
async function showResult() {
  el("stepResult").classList.remove("hidden");
  const rows = await loadAllocations();
  const mine = rows.find((r) => r.student_id === me.id);
  const body = el("resultBody");
  if (!mine) {
    body.innerHTML = '<div class="notice warn">You have not been placed yet. Contact the tutor.</div>';
    return;
  }
  const slot = tut(mine.tutorial_id);
  const mates = rows.filter((r) => r.group_no === mine.group_no)
    .map((r) => students.find((s) => s.id === r.student_id)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  body.innerHTML =
    '<div class="stat" style="margin-bottom:18px">' +
      "<div><b>" + mine.group_no + "</b><span>your group</span></div>" +
      "<div><b>" + (slot ? escapeHtml(slot.when_text) : "TBC") + "</b><span>" +
        (slot ? escapeHtml(slot.label) : "slot to be confirmed") + "</span></div>" +
      (slot && slotInfo(slot).full
        ? "<div><b>" + escapeHtml(slotInfo(slot).full) + "</b><span>full tutorial</span></div>"
        : "") +
    "</div><h2>Who's with you (" + mates.length + ")</h2>" +
    '<div class="scroll-x"><table><tbody>' + mates.map((m) =>
      "<tr><td>" + escapeHtml(m.name) +
      (m.id === me.id ? ' <span class="badge ok">you</span>' : "") +
      '</td><td style="text-align:right">' +
      (m.is_vet ? '<span class="badge vet">vet</span>' : "") + "</td></tr>").join("") +
    "</tbody></table></div>";
}
