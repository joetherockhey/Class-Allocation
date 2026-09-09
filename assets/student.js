import { loadCore, getPrefs, savePrefs, loadAllocations, el, escapeHtml, backendNotice }
  from "./api.js";
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

  el("whoami").textContent = student.name + (student.is_vet ? " · vet" : "");
  el("whoami").classList.remove("hidden");
  el("switchBtn").classList.remove("hidden");
  el("stepName").classList.add("hidden");

  if (settings.results_published === "true") { await showResult(); return; }

  const open = settings.submissions_open !== "false";
  el("stepPrefs").classList.remove("hidden");
  el("saveMsg").textContent = !open ? "Submissions are closed."
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

function renderGrid() {
  const wrap = el("gridWrap");
  const parsed = tutorials.map((t) => ({ t, p: parseSlot(t) }));

  if (parsed.some((x) => !x.p)) { renderFlatList(wrap, parsed); return; }

  // Days and times both keep first-appearance order, which is sort_order and
  // therefore chronological. Sorting the labels alphabetically would put
  // "10-11am" before "9-10am".
  const days = [];
  const times = [];
  for (const { p } of parsed) {
    if (!days.includes(p.day)) days.push(p.day);
    if (!times.includes(p.time)) times.push(p.time);
  }

  const cellOf = new Map();
  let collision = false;
  for (const { t, p } of parsed) {
    const key = p.day + "|" + p.time;
    if (cellOf.has(key)) collision = true;
    cellOf.set(key, t);
  }
  // Two slots in one cell, or a grid too sparse to be a timetable: use a list.
  if (collision || days.length > 7) { renderFlatList(wrap, parsed); return; }

  let html = '<div class="scroll-x"><table class="weekgrid"><thead><tr><th></th>';
  for (const d of days) {
    html += '<th><button class="tiny daybtn" data-day="' + escapeHtml(d) + '">' +
      escapeHtml(d) + "</button></th>";
  }
  html += "</tr></thead><tbody>";
  for (const time of times) {
    html += "<tr><th>" + escapeHtml(time) + "</th>";
    for (const d of days) {
      const t = cellOf.get(d + "|" + time);
      html += "<td>" + (t
        ? '<button class="slot' + (prefs.includes(t.id) ? " on" : "") +
          '" data-id="' + escapeHtml(t.id) + '">' +
          (prefs.includes(t.id) ? prefs.indexOf(t.id) + 1 : "") + "</button>"
        : "") + "</td>";
    }
    html += "</tr>";
  }
  html += "</tbody></table></div>";
  wrap.innerHTML = html;

  wrap.querySelectorAll("button.slot").forEach((b) => {
    b.onclick = () => toggle(b.dataset.id);
  });
  wrap.querySelectorAll("button.daybtn").forEach((b) => {
    b.onclick = () => toggleDay(b.dataset.day, parsed);
  });
}

function renderFlatList(wrap, parsed) {
  wrap.innerHTML = '<div class="namegrid">' + parsed.map(({ t }) =>
    '<button class="namebtn slotflat' + (prefs.includes(t.id) ? " on" : "") +
    '" data-id="' + escapeHtml(t.id) + '"><span class="who">' +
    escapeHtml(t.label) + "</span></button>").join("") + "</div>";
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
    '<div class="meta"><b>' + escapeHtml(t.when_text) + "</b><span>" +
      escapeHtml(t.label) + (t.location ? " · " + escapeHtml(t.location) : "") + "</span></div>" +
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
    "</div><h2>Who's with you (" + mates.length + ")</h2>" +
    '<div class="scroll-x"><table><tbody>' + mates.map((m) =>
      "<tr><td>" + escapeHtml(m.name) +
      (m.id === me.id ? ' <span class="badge ok">you</span>' : "") +
      '</td><td style="text-align:right">' +
      (m.is_vet ? '<span class="badge vet">vet</span>' : "") + "</td></tr>").join("") +
    "</tbody></table></div>";
}
