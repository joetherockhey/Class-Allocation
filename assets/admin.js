import { db, unwrap, el, setupBanner, escapeHtml } from "./db.js";

let tutorials = [], students = [], avail = [], subs = [], allocs = [], settings = {};

el("refreshBtn").addEventListener("click", () => load().catch(fail));
el("exportBtn").addEventListener("click", exportJson);

load().catch(fail);

function fail(e) {
  const b = el("banner");
  b.className = "notice warn";
  b.textContent = "Could not load: " + e.message;
  b.classList.remove("hidden");
}

async function load() {
  if (!setupBanner(el("banner"))) return;
  [tutorials, students, avail, subs, allocs, settings] = await Promise.all([
    db.from("tutorials").select("*").order("sort_order").then(unwrap),
    db.from("students").select("*").order("name").then(unwrap),
    db.from("availability").select("*").then(unwrap),
    db.from("submissions").select("*").then(unwrap),
    db.from("allocations").select("*").then(unwrap),
    db.from("settings").select("*").then(unwrap).then((r) =>
      Object.fromEntries(r.map((x) => [x.key, x.value]))),
  ]);
  renderStats();
  renderMissing();
  renderCoverage();
  renderAllocations();
}

const byId = (arr) => new Map(arr.map((x) => [x.id, x]));

function renderStats() {
  const done = new Set(subs.map((s) => s.student_id));
  const vets = students.filter((s) => s.is_vet);
  const vetsDone = vets.filter((s) => done.has(s.id)).length;
  const pct = students.length ? Math.round((done.size / students.length) * 100) : 0;
  const avgPrefs = done.size
    ? (avail.length / done.size).toFixed(1)
    : "0";

  el("stats").innerHTML =
    stat(done.size + " / " + students.length, "students submitted") +
    stat(vetsDone + " / " + vets.length, "vets submitted") +
    stat(pct + "%", "complete") +
    stat(avgPrefs, "slots listed on average") +
    stat(settings.results_published === "true" ? "Published" : "Draft", "results");
  el("progressBar").style.width = pct + "%";
}

const stat = (big, small) => "<div><b>" + escapeHtml(big) + "</b><span>" + escapeHtml(small) + "</span></div>";

function renderMissing() {
  const done = new Set(subs.map((s) => s.student_id));
  const missing = students.filter((s) => !done.has(s.id));
  el("missingCount").textContent = String(missing.length);
  el("missing").innerHTML = missing.length
    ? missing.map((s) =>
        '<span class="badge ' + (s.is_vet ? "vet" : "warn") + '" style="margin:0 6px 6px 0">' +
        escapeHtml(s.name) + (s.is_vet ? " · vet" : "") + "</span>").join("")
    : '<div class="notice ok">Everyone has submitted.</div>';
}

function renderCoverage() {
  const studentById = byId(students);
  const rows = tutorials.map((t) => {
    const picks = avail.filter((a) => a.tutorial_id === t.id);
    const vets = picks.filter((a) => studentById.get(a.student_id)?.is_vet).length;
    const top3 = picks.filter((a) => a.rank <= 3).length;
    return { t, n: picks.length, vets, top3 };
  });
  const max = Math.max(1, ...rows.map((r) => r.n));

  el("coverage").innerHTML = rows.map((r) => {
    const thin = r.n < 6 || r.vets < 1;
    return "<tr>" +
      "<td><b>" + escapeHtml(r.t.label) + "</b></td>" +
      "<td>" + escapeHtml(r.t.when_text) + (r.t.location ? " · " + escapeHtml(r.t.location) : "") + "</td>" +
      "<td>" + r.n + '<div class="bar" style="width:90px"><i style="width:' +
        Math.round((r.n / max) * 100) + '%"></i></div></td>' +
      "<td>" + (r.vets ? r.vets : '<span class="badge warn">0</span>') + "</td>" +
      "<td>" + r.top3 + (thin ? ' <span class="badge warn">thin</span>' : "") + "</td>" +
      "</tr>";
  }).join("");
}

function renderAllocations() {
  if (!allocs.length) return;
  el("allocPanel").classList.remove("hidden");
  const studentById = byId(students);
  const tutById = byId(tutorials);
  const groups = new Map();
  for (const a of allocs) {
    if (!groups.has(a.group_no)) groups.set(a.group_no, []);
    groups.get(a.group_no).push(a);
  }
  const parts = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([no, members]) => {
    const slot = tutById.get(members[0].tutorial_id);
    const names = members
      .map((m) => studentById.get(m.student_id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => escapeHtml(s.name) + (s.is_vet ? ' <span class="badge vet">vet</span>' : ""))
      .join("<br>");
    return "<tr><td><b>Group " + no + "</b><br><span class=\"sub\">" +
      escapeHtml(members[0].group_name || "") + "</span></td>" +
      "<td>" + (slot ? escapeHtml(slot.label) + "<br><span class=\"sub\">" +
        escapeHtml(slot.when_text) + "</span>" : "TBC") + "</td>" +
      "<td>" + names + "</td></tr>";
  });
  el("allocBody").innerHTML =
    '<div class="scroll-x"><table><thead><tr><th>Group</th><th>Slot</th><th>Members</th></tr></thead><tbody>' +
    parts.join("") + "</tbody></table></div>";
}

function exportJson() {
  const prefsBy = new Map();
  for (const a of avail) {
    if (!prefsBy.has(a.student_id)) prefsBy.set(a.student_id, []);
    prefsBy.get(a.student_id).push(a);
  }
  const done = new Set(subs.map((s) => s.student_id));
  const payload = {
    exported_at: new Date().toISOString(),
    tutorials: tutorials.map((t) => ({
      id: t.id, label: t.label, when: t.when_text, location: t.location || "",
    })),
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      is_vet: s.is_vet,
      submitted: done.has(s.id),
      preferences: (prefsBy.get(s.id) || [])
        .sort((a, b) => a.rank - b.rank)
        .map((a) => a.tutorial_id),
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "allocation-input.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
