/**
 * The class feed on the home page: posts with an optional photo or file,
 * likes, and comments.
 *
 * There are no accounts, so a person is just the name they type. It is
 * remembered in this browser so they only type it once, and it is what a like
 * is keyed on. Good enough for a class; not a security boundary.
 */
import { db, el, escapeHtml, ready, editingClient } from "./api.js";

const NAME_KEY = "tutgroups.msgname";
const TOKENS_KEY = "tutgroups.myposts";   // post id -> the token that can edit it
const BUCKET = "uploads";
const MAX_BYTES = 10 * 1024 * 1024;

let posts = [];
let comments = new Map();   // post id -> rows
let likes = new Map();      // post id -> [who]
let pending = null;         // the file waiting to go up with the next post
let seenPosts = null;       // ids known at the last poll - null until the first
let seenComments = null;
let polling = null;

export const myName = () => {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
};
const remember = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode */ } };

const myTokens = () => {
  try { return JSON.parse(localStorage.getItem(TOKENS_KEY)) || {}; } catch { return {}; }
};
const keepToken = (id, token) => {
  try {
    const all = myTokens();
    all[id] = token;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
  } catch { /* private mode - the post just will not be editable here */ }
};

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
  setupNotifications();
  el("postFile").addEventListener("change", pickFile);
  el("dropFile").addEventListener("click", () => el("postFile").click());
  el("clearFile").addEventListener("click", clearFile);

  await refresh();
  startPolling();
}

/* ------------------------------------------------------------ notifications
 * There is no server behind this site, so these can only fire while the page
 * is open somewhere - a background tab counts, a closed browser does not. The
 * wording says so rather than implying push notifications.
 */
function notifyState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;                     // default | granted | denied
}

function setupNotifications() {
  const bar = el("notifyBar");
  if (!bar) return;
  const state = notifyState();
  if (state === "unsupported") { bar.hidden = true; return; }
  if (state === "granted") {
    bar.className = "notifybar on";
    bar.innerHTML = '<span>Notifications are on. You will be told about new posts while this page is open in a tab.</span>';
    return;
  }
  if (state === "denied") {
    bar.className = "notifybar off";
    bar.innerHTML = '<span>Notifications are blocked for this site. Turn them back on in your browser settings if you want them.</span>';
    return;
  }
  bar.className = "notifybar";
  bar.innerHTML = '<span>Want to know when someone posts? <b>Turn on notifications.</b> ' +
    'They arrive while this page is open in a tab.</span>' +
    '<button id="notifyBtn" class="tiny">Turn on</button>';
  el("notifyBtn").addEventListener("click", async () => {
    try { await Notification.requestPermission(); } catch { /* older browsers */ }
    setupNotifications();
  });
}

function tell(title, body) {
  if (notifyState() !== "granted") return;
  try {
    const n = new Notification(title, { body, tag: "feed-" + Date.now() });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* some browsers only allow this from a service worker */ }
}

function startPolling() {
  if (polling) clearInterval(polling);
  polling = setInterval(() => {
    if (document.hidden && notifyState() !== "granted") return;   // nothing to gain
    refresh().catch(() => {});
  }, 25000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh().catch(() => {});
  });
}

async function refresh() {
  const box = el("feed");
  const [p, c, l] = await Promise.all([
    db.from("posts").select("id,name,body,file_url,file_name,file_kind,created_at,edited_at")
      .order("created_at", { ascending: false }).limit(200),
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
  announce();
  render();
}

/** Tell the reader about anything new since the last poll - other people's
 *  posts and comments only, never their own. */
function announce() {
  const me = myName().trim().toLowerCase();
  const postIds = new Set(posts.map((p) => p.id));
  const commentIds = new Set([...comments.values()].flat().map((c) => c.id));

  if (seenPosts) {
    const fresh = posts.filter((p) => !seenPosts.has(p.id) && p.name.trim().toLowerCase() !== me);
    if (fresh.length === 1) tell(fresh[0].name + " posted", fresh[0].body.slice(0, 120));
    else if (fresh.length > 1) tell(fresh.length + " new posts", fresh.map((p) => p.name).join(", "));

    const freshC = [...comments.values()].flat()
      .filter((c) => !seenComments.has(c.id) && c.name.trim().toLowerCase() !== me);
    if (freshC.length === 1) tell(freshC[0].name + " commented", freshC[0].body.slice(0, 120));
    else if (freshC.length > 1) tell(freshC.length + " new comments", freshC.map((c) => c.name).join(", "));
  }
  seenPosts = postIds;
  seenComments = commentIds;
}

/* ------------------------------------------------------------------ render */
function render() {
  const box = el("feed");
  if (!posts.length) {
    box.innerHTML = '<p class="empty">Nothing here yet. Be the first to say how your tutorial went.</p>';
    return;
  }
  const me = myName().toLowerCase();
  const tokens = myTokens();
  box.innerHTML = posts.map((p) => {
    const mine = likes.get(p.id) || [];
    const mineToEdit = Boolean(tokens[p.id]);
    const liked = mine.some((w) => w.toLowerCase() === me);
    const cs = comments.get(p.id) || [];
    return `<article class="post" data-id="${escapeHtml(p.id)}">
      <header>
        <span class="who">${escapeHtml(p.name)}</span>
        <time>${escapeHtml(when(p.created_at))}</time>
      </header>
      <p class="body">${escapeHtml(p.body)}${p.edited_at ? '<span class="edited">edited</span>' : ""}</p>
      ${attachment(p)}
      <div class="acts">
        <button class="like${liked ? " on" : ""}" data-id="${escapeHtml(p.id)}">
          ${liked ? "♥" : "♡"} <span>${mine.length || ""}</span>
        </button>
        <button class="cmt" data-id="${escapeHtml(p.id)}">
          ${cs.length ? cs.length + (cs.length === 1 ? " comment" : " comments") : "Comment"}
        </button>
        ${mineToEdit ? `<button class="edit" data-id="${escapeHtml(p.id)}">Edit</button>` : ""}
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
  box.querySelectorAll("button.edit").forEach((b) => { b.onclick = () => startEdit(b.dataset.id); });
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
    const token = (crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + Math.random().toString(36).slice(2);
    const { data, error } = await db.from("posts")
      .insert({ name, body, file_url, file_name, file_kind, edit_token: token })
      .select("id").single();
    if (error) throw new Error(error.message);
    if (data && data.id) keepToken(data.id, token);
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

/* --------------------------------------------------------- editing a post */
function startEdit(postId) {
  const card = el("feed").querySelector(`.post[data-id="${CSS.escape(postId)}"]`);
  if (!card || card.querySelector(".editform")) return;
  const post = posts.find((p) => p.id === postId);
  const bodyEl = card.querySelector(".body");
  bodyEl.hidden = true;
  const form = document.createElement("form");
  form.className = "editform";
  form.innerHTML =
    '<textarea rows="3" maxlength="2000"></textarea>' +
    '<div class="row"><button type="submit">Save</button>' +
    '<button type="button" class="cancel ghost tiny">Cancel</button>' +
    '<span class="err"></span></div>';
  form.querySelector("textarea").value = post ? post.body : "";
  bodyEl.after(form);
  form.querySelector("textarea").focus();

  form.querySelector(".cancel").onclick = () => { form.remove(); bodyEl.hidden = false; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = form.querySelector("textarea").value.trim();
    const err = form.querySelector(".err");
    if (!text) { err.textContent = "Say something, or cancel."; return; }
    const token = myTokens()[postId];
    const client = token && editingClient(token);
    if (!client) { err.textContent = "This post cannot be edited from this browser."; return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    const { error } = await client.from("posts")
      .update({ body: text, edited_at: new Date().toISOString() }).eq("id", postId);
    btn.disabled = false;
    if (error) { err.textContent = "Could not save: " + error.message; return; }
    form.remove();
    bodyEl.hidden = false;
    await refresh();
  };
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
