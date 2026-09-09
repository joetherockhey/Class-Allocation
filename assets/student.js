import { db, unwrap, el, setupBanner, escapeHtml } from "./db.js";
import { COURSE_TITLE, INTRO } from "./config.js";

const LS_KEY = "tutgroups.studentId";

let tutorials = [];          // [{id,label,when_text,location,sort_order}]
let students  = [];          // [{id,name,is_vet}]
let submitted = new Set();   // student ids that have submitted
let settings  = {};
let me        = null;        // current student row
let prefs     = [];          // ordered tutorial ids
let dirty     = false;

/* ------------------------------------------------------------------ boot */
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
  if (!setupBanner(el("banner"))) return;

  [tutorials, students, settings, submitted] = await Promise.all([
    db.from("tutorials").select("*").order("sort_order").then(unwrap),
    db.from("students").select("*").order("name").then(unwrap),
    db.from("settings").select("*").then(unwrap).then((rows) =>
      Object.fromEntries(rows.map((r) => [r.key, r.value]))),
    db.from("submissions").select("student_id").then(unwrap)
      .then((rows) => new Set(rows.map((r) => r.student_id))),
  ]);

  if (settings.deadline_text) {
    const b = el("banner");
    b.className = "notice";
    b.textContent = settings.deadline_text;
    b.classList.remove("hidden");
  }

  wireEvents();
  const saved = localStorage.getItem(LS_KEY);
  const known = students.find((s) => s.id === saved);
  if (known) await signIn(known);
  else showNamePicker();
}

function wireEvents() {
  el("nameSearch").addEventListener("input", renderNameGrid);
  el("switchBtn").addEventListener("click", signOut);
  el("saveBtn").addEventListener("click", save);
  el("clearBtn").addEventListener("click", () => {
    if (!prefs.length || !confirm("Remove all your preferences?")) return;
    prefs = [];
    dirty = true;
    renderPrefs();
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });
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

  const existing = unwrap(
    await db.from("availability").select("tutorial_id,rank")
      .eq("student_id", student.id).order("rank"));
  prefs = existing.map((r) => r.tutorial_id).filter((id) => tutorials.some((t) => t.id === id));
  dirty = false;

  el("whoami").textContent = student.name + (student.is_vet ? " · vet" : "");
  el("whoami").classList.remove("hidden");
  el("switchBtn").classList.remove("hidden");
  el("stepName").classList.add("hidden");

  if (settings.results_published === "true") {
    await showResult();
    return;
  }
  const open = settings.submissions_open !== "false";
  el("stepPrefs").classList.remove("hidden");
  el("saveBtn").disabled = !open;
  el("saveMsg").textContent = !open
    ? "Submissions are closed."
    : submitted.has(student.id)
      ? "Already submitted — edits are saved when you press submit again."
      : "";
  renderPrefs();
}

function signOut() {
  if (dirty && !confirm("You have unsaved changes. Leave anyway?")) return;
  localStorage.removeItem(LS_KEY);
  me = null;
  prefs = [];
  dirty = false;
  el("nameSearch").value = "";
  showNamePicker();
}

/* -------------------------------------------------------- preference lists */
function tut(id) { return tutorials.find((t) => t.id === id); }

function renderPrefs() {
  const pool = tutorials.filter((t) => !prefs.includes(t.id));
  const poolEl = el("poolList");
  poolEl.innerHTML = "";
  for (const t of pool) poolEl.appendChild(poolRow(t));

  const prefEl = el("prefList");
  prefEl.innerHTML = "";
  prefs.forEach((id, i) => {
    const t = tut(id);
    if (t) prefEl.appendChild(prefRow(t, i));
  });

  el("availCount").textContent = pool.length + " left";
  el("prefCount").textContent = prefs.length + " chosen";
  el("saveBtn").textContent = prefs.length
    ? "Submit " + prefs.length + " preference" + (prefs.length === 1 ? "" : "s")
    : "Submit my preferences";
}

function slotMeta(t) {
  const sub = escapeHtml(t.when_text) + (t.location ? " · " + escapeHtml(t.location) : "");
  return '<div class="meta"><b>' + escapeHtml(t.label) + "</b><span>" + sub + "</span></div>";
}

function poolRow(t) {
  const d = document.createElement("div");
  d.className = "item";
  d.innerHTML = slotMeta(t) + '<div class="acts"><button class="tiny">Add</button></div>';
  d.querySelector("button").onclick = () => {
    prefs.push(t.id);
    dirty = true;
    renderPrefs();
  };
  return d;
}

function prefRow(t, i) {
  const d = document.createElement("div");
  d.className = "item";
  d.draggable = true;
  d.dataset.idx = String(i);
  d.innerHTML =
    '<span class="rank">' + (i + 1) + "</span>" + slotMeta(t) +
    '<div class="acts">' +
      '<button class="tiny" data-a="up" title="Move up"' + (i === 0 ? " disabled" : "") + ">▲</button>" +
      '<button class="tiny" data-a="down" title="Move down"' + (i === prefs.length - 1 ? " disabled" : "") + ">▼</button>" +
      '<button class="tiny" data-a="remove" title="Remove">✕</button>' +
    "</div>" +
    '<span class="grip" title="Drag to reorder">⠿</span>';
  d.querySelector('[data-a="up"]').onclick = () => move(i, i - 1);
  d.querySelector('[data-a="down"]').onclick = () => move(i, i + 1);
  d.querySelector('[data-a="remove"]').onclick = () => {
    prefs.splice(i, 1);
    dirty = true;
    renderPrefs();
  };
  addDrag(d);
  return d;
}

function move(from, to) {
  if (to < 0 || to >= prefs.length) return;
  prefs.splice(to, 0, prefs.splice(from, 1)[0]);
  dirty = true;
  renderPrefs();
}

let dragFrom = null;
function addDrag(node) {
  node.addEventListener("dragstart", (e) => {
    dragFrom = Number(node.dataset.idx);
    node.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragFrom)); // Firefox needs a payload
  });
  node.addEventListener("dragend", () => {
    node.classList.remove("dragging");
    dragFrom = null;
  });
  node.addEventListener("dragover", (e) => {
    e.preventDefault();
    node.classList.add("over");
  });
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
  if (!prefs.length && !confirm("You have not chosen any tutorials. Submit an empty list?")) return;
  const btn = el("saveBtn");
  btn.disabled = true;
  el("saveMsg").textContent = "Saving…";
  try {
    unwrap(await db.from("availability").delete().eq("student_id", me.id));
    if (prefs.length) {
      unwrap(await db.from("availability").insert(
        prefs.map((id, i) => ({ student_id: me.id, tutorial_id: id, rank: i + 1 }))));
    }
    unwrap(await db.from("submissions")
      .upsert({ student_id: me.id, submitted_at: new Date().toISOString() }));
    submitted.add(me.id);
    dirty = false;
    el("saveMsg").innerHTML =
      '<span class="badge ok">Saved</span> You can come back and change this any time.';
  } catch (e) {
    el("saveMsg").innerHTML =
      '<span class="badge warn">Not saved</span> ' + escapeHtml(e.message);
  } finally {
    btn.disabled = false;
  }
}

/* --------------------------------------------------------------- results */
async function showResult() {
  el("stepResult").classList.remove("hidden");
  const rows = unwrap(await db.from("allocations").select("*"));
  const mine = rows.find((r) => r.student_id === me.id);
  const body = el("resultBody");

  if (!mine) {
    body.innerHTML =
      '<div class="notice warn">You have not been placed in a group yet. Contact the tutor.</div>';
    return;
  }
  const slot = tut(mine.tutorial_id);
  const mates = rows
    .filter((r) => r.group_no === mine.group_no)
    .map((r) => students.find((s) => s.id === r.student_id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const rowsHtml = mates.map((m) =>
    "<tr><td>" + escapeHtml(m.name) +
    (m.id === me.id ? ' <span class="badge ok">you</span>' : "") +
    '</td><td style="text-align:right">' +
    (m.is_vet ? '<span class="badge vet">vet</span>' : "") +
    "</td></tr>").join("");

  body.innerHTML =
    '<div class="stat" style="margin-bottom:18px">' +
      "<div><b>" + mine.group_no + "</b><span>" +
        escapeHtml(mine.group_name || "Group") + "</span></div>" +
      "<div><b>" + (slot ? escapeHtml(slot.label) : "TBC") + "</b><span>" +
        (slot ? escapeHtml(slot.when_text) : "slot to be confirmed") + "</span></div>" +
    "</div>" +
    "<h2>Your group (" + mates.length + ")</h2>" +
    '<div class="scroll-x"><table><tbody>' + rowsHtml + "</tbody></table></div>";
}
