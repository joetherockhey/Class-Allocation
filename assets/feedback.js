/**
 * The questionnaire the audience scans into. Four pick-one questions, a
 * written answer, and a tutorial to attach it to. No name, no login - see
 * supabase/feedback.sql.
 */
import { tutorialList, postFeedback, el, escapeHtml, mode } from "./api.js";
import { CHOICES, TEXT_QUESTIONS } from "./feedback-stats.js";

const DONE_KEY = "tutgroups.feedback.done";     // tutorials this phone has rated

const form = el("fbForm"), msg = el("fbMsg"), pick = el("tutPick");

/* ------------------------------------------------------ the pick-one questions */
// Nothing is preselected, so a question the student skipped is stored as null
// rather than as whatever happened to be first.
el("choices").innerHTML = CHOICES.map((q) => `
  <fieldset class="crow">
    <legend>${escapeHtml(q.question)}</legend>
    <div class="opts">` + q.options.map((o) => `
      <label class="opt">
        <input type="radio" name="${q.key}" value="${escapeHtml(o.v)}">
        <span>${escapeHtml(o.label)}</span>
      </label>`).join("") + `
    </div>
  </fieldset>`).join("");

el("textQs").innerHTML = TEXT_QUESTIONS.map((q) => `
  <section class="panel">
    <h2><label for="t_${q.key}">${escapeHtml(q.question)}</label></h2>
    <p class="sub" style="margin:2px 0 10px">Optional.</p>
    <textarea id="t_${q.key}" rows="4" maxlength="1000"
      placeholder="${escapeHtml(q.placeholder)}"></textarea>
  </section>`).join("");

const written = (key) => el("t_" + key).value.trim() || null;

const picked = (key) => {
  const hit = form.querySelector(`input[name="${key}"]:checked`);
  return hit ? hit.value : null;
};

/* ------------------------------------------------------- the tutorial list */
try {
  const tutorials = await tutorialList();
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
  const row = {
    tutorial_id: pick.value,
    ...Object.fromEntries(TEXT_QUESTIONS.map((q) => [q.key, written(q.key)])),
    ...Object.fromEntries(CHOICES.map((q) => [q.key, picked(q.key)])),
  };
  if (!row.tutorial_id) { msg.textContent = "Pick your tutorial first."; return; }
  const blank = CHOICES.every((q) => row[q.key] === null) &&
                TEXT_QUESTIONS.every((q) => row[q.key] === null);
  if (blank) {
    msg.textContent = "Answer something first — a question, or one of the boxes at the end.";
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
  for (const q of CHOICES) for (const r of form.querySelectorAll(`input[name="${q.key}"]`)) r.checked = false;
  msg.textContent = "";
  el("thanks").classList.add("hidden");
  form.classList.remove("hidden");
});
