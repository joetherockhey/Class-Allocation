/**
 * The class feed on the home page: posts with an optional photo or file,
 * likes, and comments.
 *
 * There are no accounts, so a person is just the name they type. It is
 * remembered in this browser so they only type it once, and it is what a like
 * is keyed on. Good enough for a class; not a security boundary.
 */
import { db, el, escapeHtml, ready } from "./api.js";

const NAME_KEY = "tutgroups.msgname";
const BUCKET = "uploads";
const MAX_BYTES = 10 * 1024 * 1024;

let posts = [];
let comments = new Map();   // post id -> rows
let likes = new Map();      // post id -> [who]
let pending = null;         // the file waiting to go up with the next post

export const myName = () => {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
};
const remember = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ } };

const when = (iso) => {
  const d = new Date(iso), mins = (Date.now() - d) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return Math.floor(mins) + "m ago";
  if (mins < 24 * 60) return Math.floor(mins / 60) + "h ago";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

/* -------------------------------------------------------------------- load */
export async function initFeed() {
  const box = el("feed");
  if (!box) return;
  if (!ready()) { box.innerHTML = '<p class="sub">Feed unavailable.</p>'; return; }

  el("postName").value = myName();
  el("postBtn").addEventListener("click", submitPost);
  el("postFile").addEventListener("change", pickFile);
  el("dropFile").addEventListener("click", () => el("postFile").click());
  el("clearFile").addEventListener("click", clearFile);

  await refresh();
}

async function refresh() {
  const box = el("feed");
  const [p, c, l] = await Promise.all([
    db.from("posts").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("post_comments").select("*").order("created_at"),
    db.from("post_likes").select("*"),
  ]);
  if (p.error) {
    box.innerHTML = /posts/.test(p.error.message)
      ? '<div class="notice">The feed is not set up yet.</div>'
      : '<div class="notice warn">' + escapeHtml(p.error.message) + "</div>";
    return;
  }
  posts = p.data || [];
  comments = new Map();
  for (const row of c.data || []) {
    if (!comments.has(row.post_id)) comments.set(row.post_id, []);
    comments.get(row.post_id).push(row);
  }
  likes = new Map();
  for (const row of l.data || []) {
    if (!likes.has(row.post_id)) likes.set(row.post_id, []);
    likes.get(row.post_id).push(row.who);
  }
  render();
}

/* ------------------------------------------------------------------ render */
function render() {
  const box = el("feed");
  if (!posts.length) {
    box.innerHTML = '<p class="empty">Nothing here yet. Be the first to say how your tutorial went.</p>';
    return;
  }
  const me = myName().toLowerCase();
  box.innerHTML = posts.map((p) => {
    const mine = likes.get(p.id) || [];
    const liked = mine.some((w) => w.toLowerCase() === me);
    const cs = comments.get(p.id) || [];
    return `<article class="post" data-id="${escapeHtml(p.id)}">
      <header>
        <span class="who">${escapeHtml(p.name)}</span>
        <time>${escapeHtml(when(p.created_at))}</time>
      </header>
      <p class="body">${escapeHtml(p.body)}</p>
      ${attachment(p)}
      <div class="acts">
        <button class="like${liked ? " on" : ""}" data-id="${escapeHtml(p.id)}">
          ${liked ? "♥" : "♡"} <span>${mine.length || ""}</span>
        </button>
        <button class="cmt" data-id="${escapeHtml(p.id)}">
          ${cs.length ? cs.length + (cs.length === 1 ? " comment" : " comments") : "Comment"}
        </button>
        ${mine.length ? `<span class="likers" title="${escapeHtml(mine.join(", "))}">${escapeHtml(mine.slice(0, 3).join(", "))}${mine.length > 3 ? " +" + (mine.length - 3) : ""}</span>` : ""}
      </div>
      <div class="comments" hidden>
        ${cs.map((c) => `<div class="c"><b>${escapeHtml(c.name)}</b> <time>${escapeHtml(when(c.created_at))}</time><p>${escapeHtml(c.body)}</p></div>`).join("")}
        <form class="cform">
          <input class="cname" type="text" placeholder="Your name" maxlength="60" value="${escapeHtml(myName())}" required>
          <input class="cbody" type="text" placeholder="Write a comment…" maxlength="600" required>
          <button type="submit">Post</button>
        </form>
      </div>
    </article>`;
  }).join("");

  box.querySelectorAll("button.like").forEach((b) => { b.onclick = () => toggleLike(b.dataset.id); });
  box.querySelectorAll("button.cmt").forEach((b) => {
    b.onclick = () => {
      const c = b.closest(".post").querySelector(".comments");
      c.hidden = !c.hidden;
      if (!c.hidden) c.querySelector(".cbody").focus();
    };
  });
  box.querySelectorAll("form.cform").forEach((f) => {
    f.onsubmit = (e) => { e.preventDefault(); addComment(f.closest(".post").dataset.id, f); };
  });
}

function attachment(p) {
  if (!p.file_url) return "";
  if (p.file_kind === "image") {
    return `<a class="shot" href="${escapeHtml(p.file_url)}" target="_blank" rel="noopener">
      <img src="${escapeHtml(p.file_url)}" alt="${escapeHtml(p.file_name || "photo")}" loading="lazy"></a>`;
  }
  return `<a class="fileline" href="${escapeHtml(p.file_url)}" target="_blank" rel="noopener">
    📎 ${escapeHtml(p.file_name || "attachment")}</a>`;
}

/* ------------------------------------------------------------- writing posts */
function pickFile(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (f.size > MAX_BYTES) {
    el("postMsg").className = "err";
    el("postMsg").textContent = "That file is over 10MB.";
    e.target.value = "";
    return;
  }
  pending = f;
  el("fileName").textContent = f.name + " (" + Math.round(f.size / 1024) + "KB)";
  el("filePick").hidden = false;
  el("postMsg").textContent = "";
}

function clearFile() {
  pending = null;
  el("postFile").value = "";
  el("filePick").hidden = true;
}

async function submitPost() {
  const out = el("postMsg");
  out.className = "";
  out.textContent = "";
  const name = el("postName").value.trim();
  const body = el("postBody").value.trim();
  if (!name || !body) { out.className = "err"; out.textContent = "Name and message are both needed."; return; }

  const btn = el("postBtn");
  btn.disabled = true;
  try {
    let file_url = null, file_name = null, file_kind = null;
    if (pending) {
      out.textContent = "Uploading…";
      const safe = pending.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60);
      const path = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "-" + safe;
      const up = await db.storage.from(BUCKET).upload(path, pending, {
        cacheControl: "3600", upsert: false, contentType: pending.type || undefined,
      });
      if (up.error) throw new Error(up.error.message);
      file_url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      file_name = pending.name;
      file_kind = (pending.type || "").startsWith("image/") ? "image" : "file";
    }
    out.textContent = "Posting…";
    const { error } = await db.from("posts").insert({ name, body, file_url, file_name, file_kind });
    if (error) throw new Error(error.message);
    remember(name);
    el("postBody").value = "";
    clearFile();
    out.className = "ok";
    out.textContent = "Posted.";
    setTimeout(() => { out.textContent = ""; out.className = ""; }, 2500);
    await refresh();
  } catch (e) {
    out.className = "err";
    out.textContent = /bucket|storage/i.test(e.message)
      ? "Uploads are not set up yet — post without a file, or ask Joe."
      : "Could not post: " + e.message;
  } finally {
    btn.disabled = false;
  }
}

async function addComment(postId, form) {
  const name = form.querySelector(".cname").value.trim();
  const body = form.querySelector(".cbody").value.trim();
  if (!name || !body) return;
  const btn = form.querySelector("button");
  btn.disabled = true;
  const { error } = await db.from("post_comments").insert({ post_id: postId, name, body });
  btn.disabled = false;
  if (error) return;
  remember(name);
  form.querySelector(".cbody").value = "";
  await refresh();
  // keep the thread the person was reading open
  const still = el("feed").querySelector(`.post[data-id="${CSS.escape(postId)}"] .comments`);
  if (still) still.hidden = false;
}

async function toggleLike(postId) {
  const name = (el("postName").value.trim() || myName()).trim();
  if (!name) {
    el("postMsg").className = "err";
    el("postMsg").textContent = "Put your name in the box above first, then you can like things.";
    el("postName").focus();
    return;
  }
  remember(name);
  const mine = likes.get(postId) || [];
  const liked = mine.some((w) => w.toLowerCase() === name.toLowerCase());
  if (liked) {
    const exact = mine.find((w) => w.toLowerCase() === name.toLowerCase());
    await db.from("post_likes").delete().eq("post_id", postId).eq("who", exact);
  } else {
    await db.from("post_likes").insert({ post_id: postId, who: name });
  }
  await refresh();
}
