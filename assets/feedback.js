/**
 * The questionnaire the audience scans into. Four sliders, a comment box, and
 * a tutorial to attach it to. No name, no login - see supabase/feedback.sql.
 */
import { loadCore, postFeedback, el, escapeHtml, mode } from "./api.js";
import { METRICS } from "./feedback-stats.js";

const DONE_KEY = "tutgroups.feedback.done";     // tutorials this phone has rated

const form = el("fbForm"), msg = el("fbMsg"), pick = el("tutPick");

/* ------------------------------------------------------------- the sliders */
// A slider starts in the middle but reports nothing until it is moved, so an
// untouched control never gets counted as a lukewarm 5.
el("sliders").innerHTML = METRICS.map((m) => `
  <div class="qrow" data-key="${m.key}">
    <label for="s_${m.key}">${escapeHtml(m.question)}</label>
    <input id="s_${m.key}" type="range" min="0" max="10" step="1" value="5"
           aria-describedby="v_${m.key}">
    <div class="ends">
      <span>${escapeHtml(m.low)}</span>
      <b id="v_${m.key}" class="val">not answered</b>
      <span>${escapeHtml(m.high)}</span>
    </div>
  </div>`).join("");

for (const m of METRICS) {
  const slider = el("s_" + m.key);
  slider.addEventListener("input", () => {
    slider.dataset.touched = "1";
    el("v_" + m.key).textContent = slider.value + " / 10";
    el("v_" + m.key).classList.add("set");
  });
}

const answer = (key) => {
  const s = el("s_" + key);
  return s.dataset.touched ? Number(s.value) : null;
};

/* ------------------------------------------------------- the tutorial list */
try {
  const { tutorials } = await loadCore();
  // Grouped by day so a phone's picker reads like a timetable.
  const days = [];
  for (const t of tutorials) {
    const day = (t.when_text || "").split(" ")[0] || "Other";
    if (!days.length || days[days.length - 1].day !== day) days.push({ day, list: [] });
    days[days.length - 1].list.push(t);
  }
  pick.insertAdjacentHTML("beforeend", days.map((d) =>
    `<optgroup label="${escapeHtml(d.day)}">` + d.list.map((t) =>
      `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`).join("") +
    "</optgroup>").join(""));
} catch (e) {
  const b = el("banner");
  b.classList.remove("hidden");
  b.classList.add("warn");
  b.textContent = "Could not load the tutorial list: " + e.message;
}

/* ------------------------------------------------------------------ submit */
const done = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY)) || []; } catch { return []; } };

pick.addEventListener("change", () => {
  // ponytail: a note in this browser, not a real guard - anonymous feedback
  // cannot be deduplicated. Add a per-tutorial code on the projector if it
  // ever gets abused.
  msg.textContent = done().includes(pick.value)
    ? "You have already sent feedback for this one — sending again will count twice."
    : "";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const comment = el("fbComment").value.trim();
  const row = {
    tutorial_id: pick.value,
    comment: comment || null,
    ...Object.fromEntries(METRICS.map((m) => [m.key, answer(m.key)])),
  };
  if (!row.tutorial_id) { msg.textContent = "Pick your tutorial first."; return; }
  if (METRICS.every((m) => row[m.key] === null) && !comment) {
    msg.textContent = "Move a slider or write something first.";
    return;
  }

  el("fbSend").disabled = true;
  msg.textContent = "Sending…";
  const res = await postFeedback(row);
  el("fbSend").disabled = false;
  if (res.error) {
    msg.textContent = /feedback/.test(res.error)
      ? "Not set up yet — run supabase/feedback.sql."
      : res.error;
    return;
  }
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...new Set([...done(), row.tutorial_id])])); } catch { /* private mode */ }
  form.classList.add("hidden");
  el("thanks").classList.remove("hidden");
  if (mode === "demo") el("thanks").querySelector(".sub").textContent =
    "Preview mode — nothing was actually saved.";
});

el("againBtn").addEventListener("click", () => {
  form.reset();
  for (const m of METRICS) {
    const s = el("s_" + m.key);
    delete s.dataset.touched;
    el("v_" + m.key).textContent = "not answered";
    el("v_" + m.key).classList.remove("set");
  }
  msg.textContent = "";
  el("thanks").classList.add("hidden");
  form.classList.remove("hidden");
});
