/** 阅读视图 v0.3:文档库/查词暂存(左)+ 编辑器或全宽阅读器(右)+ 弹卡升级 */
import { api, speak } from "../api.js";
import { icon } from "../icons.js";

let mode = "editor";            // editor | reader
let currentDocId = null;
let currentDocTitle = "";
let currentStatuses = {};
let currentText = "";
let sideTab = "docs";
let readerFont = Number(localStorage.getItem("lexiflow:font") || 17);
let dimKnown = localStorage.getItem("lexiflow:dim") !== "off";
let recentLookups = JSON.parse(localStorage.getItem("lexiflow:recent") || "[]");
let popupKeyHandler = null;

export async function render(view) {
  view.innerHTML = `
    <h1>${icon("read", 20)} 沉浸阅读</h1>
    <div class="hint">点词查义 → 一键收词(Enter)→ 自动进入复习队列。收过的词全文高亮。</div>
    <div class="grid2">
      <div id="read-side" class="card side-col">
        <div class="chips" style="margin:0 0 10px">
          <span class="chip ${sideTab === "docs" ? "active" : ""}" data-t="docs">文档</span>
          <span class="chip ${sideTab === "lookups" ? "active" : ""}" data-t="lookups">最近查词</span>
        </div>
        <div id="side-body"></div>
      </div>
      <div id="read-main"></div>
    </div>`;

  view.querySelectorAll(".chip").forEach(c => {
    c.onclick = () => { sideTab = c.dataset.t; renderSide(view); };
  });
  renderSide(view);

  const openId = sessionStorage.getItem("lexiflow:opendoc");
  const forceNew = sessionStorage.getItem("lexiflow:newdoc");
  sessionStorage.removeItem("lexiflow:opendoc");
  sessionStorage.removeItem("lexiflow:newdoc");
  if (openId) await openDoc(view, Number(openId));
  else if (forceNew) setMode(view, "editor");
  else {
    const docs = (await api("/api/docs")).docs;
    if (mode === "reader" && currentDocId) renderMain(view);
    else if (docs.length) await openDoc(view, docs[0].id);
    else setMode(view, "editor");
  }
}

function setMode(view, m) {
  mode = m;
  renderMain(view);
}

function renderSide(view) {
  const body = view.querySelector("#side-body");
  view.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.t === sideTab));
  if (sideTab === "docs") {
    api("/api/docs").then(({ docs }) => {
      body.innerHTML = `<button id="side-new" class="primary" style="width:100%">${icon("plus", 14)} 新文档</button><div id="doc-items" class="mt"></div>`;
      body.querySelector("#side-new").onclick = () => { currentDocId = null; setMode(view, "editor"); };
      const items = body.querySelector("#doc-items");
      if (!docs.length) items.innerHTML = `<div class="hero-s" style="text-align:center; padding:16px 0">暂无文档</div>`;
      for (const d of docs) {
        const el = document.createElement("div");
        el.className = "doc-item" + (d.id === currentDocId ? " active" : "");
        el.innerHTML = `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${icon("doc", 14)} ${esc(d.title)}</span><span class="del">${icon("x", 13)}</span>`;
        el.onclick = () => openDoc(view, d.id);
        el.querySelector(".del").onclick = async e => {
          e.stopPropagation();
          await api(`/api/docs/${d.id}`, { method: "DELETE" });
          if (d.id === currentDocId) { currentDocId = null; setMode(view, "editor"); }
          renderSide(view);
        };
        items.appendChild(el);
      }
    });
  } else {
    const items = recentLookups.map(l => `
      <div class="word-row" data-w="${escAttr(l.word)}">
        <span class="tw">${esc(l.word)}</span>
        <span class="tt">${esc(l.zh ?? "")}</span>
        <button class="mini-add ${l.status === "learning" ? "hidden" : ""}" title="收词">${icon("plus", 13)}</button>
      </div>`).join("");
    body.innerHTML = recentLookups.length
      ? `${items}<div class="hero-s mt" style="text-align:center">查过没收的词都在这,别丢</div>`
      : `<div class="hero-s" style="text-align:center; padding:16px 0">阅读时查过的词会出现在这</div>`;
    body.querySelectorAll(".word-row").forEach(row => {
      row.onclick = () => showPopupFor(row.dataset.w, null);
      row.querySelector(".mini-add")?.addEventListener("click", async e => {
        e.stopPropagation();
        await api("/api/words/add", { method: "POST", body: { word: row.dataset.w, source: "recent", context: "" } });
        markRecent(row.dataset.w, "learning");
        renderSide(view);
        window.dispatchEvent(new Event("lexiflow:stats"));
      });
    });
  }
}

function rememberLookup(r) {
  if (!r.entry) return;
  recentLookups = recentLookups.filter(x => x.word !== r.query);
  recentLookups.unshift({ word: r.query, zh: firstLine(r.entry.translation || r.entry.definition), status: r.status });
  recentLookups = recentLookups.slice(0, 30);
  localStorage.setItem("lexiflow:recent", JSON.stringify(recentLookups));
  if (sideTab === "lookups") renderSide(document.getElementById("view"));
}

function markRecent(word, status) {
  const item = recentLookups.find(x => x.word === word);
  if (item) { item.status = status; localStorage.setItem("lexiflow:recent", JSON.stringify(recentLookups)); }
}

function firstLine(t) { return String(t ?? "").replace(/\\n|[\r\n]+/g, "; ").split(/;|\s{2,}/)[0].trim().slice(0, 24); }

// ---- 右侧主区:编辑器 / 阅读器 ----

function renderMain(view) {
  const main = view.querySelector("#read-main");
  if (mode === "editor") return renderEditor(view, main);
  renderReader(view, main);
}

function renderEditor(view, main) {
  main.innerHTML = `
    <div class="card">
      <div class="row"><input id="doc-title" placeholder="文档标题" style="flex:1"><button id="doc-save" class="primary">${icon("check", 14)} 保存</button></div>
      <textarea id="doc-text" rows="12" class="mt" placeholder="粘贴英文文章…"> ${esc(currentText)}</textarea>
      <div class="row mt">
        <button id="doc-analyze" class="primary">${icon("arrow", 14)} 开始阅读</button>
        <label style="margin:0; display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--dim)">
          <input type="file" id="doc-file" accept=".txt,.md,.srt" class="hidden">导入文件</label>
      </div>
    </div>`;
  const ta = main.querySelector("#doc-text");
  ta.value = currentText;
  ta.oninput = () => { currentText = ta.value; };
  main.querySelector("#doc-save").onclick = saveDoc;
  main.querySelector("#doc-analyze").onclick = async () => {
    currentText = ta.value.trim();
    if (!currentText) { hint(main, "先粘贴一段英文文本,再开始阅读"); return; }
    await analyze(view);
    setMode(view, "reader");
  };
  main.querySelector("#doc-file").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    currentText = (await f.text()).slice(0, 500_000);
    ta.value = currentText;
  };
}

async function saveDoc() {
  const main = document.getElementById("view").querySelector("#read-main");
  if (!currentText.trim()) { hint(main, "先粘贴文本再保存"); return null; }
  const title = currentDocTitle || currentText.slice(0, 20);
  if (currentDocId) {
    await fetch(`/api/docs/${currentDocId}`, { method: "DELETE" }).catch(() => {});
    currentDocId = null;
  }
  const { id } = await api("/api/docs", { method: "POST", body: { title, text: currentText } });
  currentDocId = Number(id);
  return id;
}

async function openDoc(view, id) {
  const d = await api(`/api/docs/${id}`);
  currentDocId = d.id;
  currentDocTitle = d.title;
  currentText = d.text;
  setMode(view, "reader");
  await analyze(view);
}

async function analyze(view) {
  const r = await api("/api/docs/analyze", { method: "POST", body: { text: currentText } });
  currentStatuses = r.statuses;
  mode = "reader";
  renderReader(view);
  const pane = view.querySelector("#reading-pane");
  let html = "", pos = 0;
  for (const t of r.tokens) {
    if (t.start > pos) html += esc(currentText.slice(pos, t.start));
    const norm = normWord(t.w);
    const st = r.statuses[norm] ?? "new";
    html += `<span class="w w-${st}" data-norm="${escAttr(norm)}" data-raw="${escAttr(t.w)}">${esc(t.w)}</span>`;
    pos = t.end;
  }
  html += esc(currentText.slice(pos));
  pane.innerHTML = html;
  view.querySelector("#reader-count").textContent =
    `共 ${r.wordCount} 词 · 认识 ${r.counts.known} · 学习中 ${r.counts.learning} · 新词 ${r.counts.new}`;
  if (currentDocId) api(`/api/docs/${currentDocId}/progress`, { method: "POST", body: { pos: 1 } });
  pane.onclick = e => {
    const w = e.target.closest(".w");
    if (w) showPopupFor(w.dataset.norm, w, w.dataset.raw);
  };
}

function renderReader(view) {
  const main = view.querySelector("#read-main");
  main.innerHTML = `
    <div class="reader-toolbar card">
      <div class="row" style="flex:1">
        <span style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${icon("doc", 14)} ${esc(currentDocTitle || "未命名")}</span>
        <span id="reader-count" style="color:var(--dim); font-size:12px"></span>
      </div>
      <div class="row">
        <button id="rt-edit" title="编辑">${icon("doc", 14)}</button>
        <button id="rt-fontdown" title="字号-">A-</button>
        <button id="rt-fontup" title="字号+">A+</button>
        <button id="rt-dim" title="已知词淡化开关">${dimKnown ? "淡化:开" : "淡化:关"}</button>
      </div>
    </div>
    <div id="reading-pane" style="font-size:${readerFont}px" class="${dimKnown ? "" : "dim-off"}"></div>`;
  main.querySelector("#rt-edit").onclick = () => setMode(view, "editor");
  main.querySelector("#rt-fontdown").onclick = () => { readerFont = Math.max(14, readerFont - 1); applyFont(); };
  main.querySelector("#rt-fontup").onclick = () => { readerFont = Math.min(26, readerFont + 1); applyFont(); };
  main.querySelector("#rt-dim").onclick = e => {
    dimKnown = !dimKnown;
    localStorage.setItem("lexiflow:dim", dimKnown ? "on" : "off");
    e.currentTarget.textContent = dimKnown ? "淡化:开" : "淡化:关";
    view.querySelector("#reading-pane").classList.toggle("dim-off", !dimKnown);
  };
  function applyFont() {
    localStorage.setItem("lexiflow:font", String(readerFont));
    view.querySelector("#reading-pane").style.fontSize = readerFont + "px";
  }
}

// ---- 弹卡 ----

function installPopupKeys(norm) {
  removePopupKeys();
  popupKeyHandler = e => {
    const popup = document.getElementById("popup");
    if (popup.classList.contains("hidden")) return removePopupKeys();
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "Enter") { e.preventDefault(); popup.querySelector("#pp-add")?.click(); }
    if (e.key === "Escape") hidePopup();
  };
  document.addEventListener("keydown", popupKeyHandler);
}
function removePopupKeys() {
  if (popupKeyHandler) { document.removeEventListener("keydown", popupKeyHandler); popupKeyHandler = null; }
}

async function showPopupFor(norm, el, rawOverride) {
  const popup = document.getElementById("popup");
  const raw = rawOverride ?? norm;
  popup.classList.remove("hidden");
  popup.innerHTML = `<div class="pw">${esc(raw)}</div><div class="pt">查询中…</div>`;
  if (el) positionPopup(popup, el); else centerPopup(popup);

  let r;
  try { r = await api(`/api/lookup/${encodeURIComponent(norm)}`); }
  catch (e) { popup.innerHTML = `<div class="pt">查询失败:${esc(e.message)}</div>`; return; }
  rememberLookup(r);

  const e2 = r.entry;
  const BOOK_NAMES = { zk: "中考", gk: "高考", cet4: "四级", cet6: "六级", ky: "考研", toefl: "托福", ielts: "雅思", gre: "GRE" };
  const statusLine = r.status === "learning" ? `<span class="tagchip">已在生词本</span>`
    : r.status === "known" ? `<span class="tagchip">已认识</span>` : "";
  const tags = e2 ? (e2.collins > 0 ? `<span class="tagchip">★${e2.collins}</span>` : "") +
    (e2.oxford ? `<span class="tagchip">Oxford</span>` : "") +
    (e2.frq ? `<span class="tagchip">频率 #${e2.frq}</span>` : "") : "";
  const bookChips = (r.books ?? []).map(b => `<span class="tagchip book">${BOOK_NAMES[b] ?? b}</span>`).join("");
  const forms = e2?.forms?.length
    ? `<div class="pt">${e2.forms.map(f => `<span class="tagchip">${f.label} ${esc(f.value)}</span>`).join("")}</div>` : "";
  const aiBtn = r.aiConfigured ? `<button id="pp-ai">${icon("spark", 14)} AI 例句</button>` : "";
  popup.innerHTML = `
    <div class="pw">${esc(raw)}${e2?.phonetic ? `<span class="pp">${esc(e2.phonetic)}</span>` : ""}</div>
    <div class="pt">${r.via === "lemma" ? `原型:${esc(e2.word)} · ` : ""}${r.via === "miss" ? "词典未收录" : ""}${statusLine}${tags}</div>
    ${bookChips ? `<div class="pt">${bookChips}</div>` : ""}
    ${forms}
    ${e2 ? `<div class="pd">${esc(e2.translation || e2.definition)}</div>` : `<div class="pd">词典中没有这个词。</div>`}
    <div id="pp-ai-box" style="min-height:0"></div>
    <div class="pbtns">
      <button id="pp-speak">🔊</button>
      ${aiBtn}
      ${r.status !== "learning" ? `<button id="pp-add" class="primary">+ 生词本 <kbd>⏎</kbd></button>` : ""}
      ${r.status === "known" ? `<button id="pp-forget">不再认识</button>` : `<button id="pp-known">已认识</button>`}
    </div>`;
  if (el) positionPopup(popup, el); else centerPopup(popup);
  installPopupKeys(norm);

  popup.querySelector("#pp-speak").onclick = () => speak(e2?.word ?? norm);
  const add = popup.querySelector("#pp-add");
  if (add) add.onclick = async () => {
    try {
      const sentence = el ? extractSentence(el) : "";
      await api("/api/words/add", { method: "POST", body: { word: norm, lemma: e2?.word ?? "", source: currentDocId ? `doc:${currentDocId}` : "reading", context: sentence } });
      if (el) setStatus(el, norm, "learning");
      markRecent(norm, "learning");
      window.dispatchEvent(new Event("lexiflow:stats"));
      hidePopup();
    } catch (e3) { showPopupError(e3.message); }
  };
  const known = popup.querySelector("#pp-known");
  if (known) known.onclick = async () => {
    try {
      await api("/api/words/known", { method: "POST", body: { word: norm } });
      if (el) setStatus(el, norm, "known");
      markRecent(norm, "known");
      window.dispatchEvent(new Event("lexiflow:stats"));
      hidePopup();
    } catch (e3) { showPopupError(e3.message); }
  };
  const forget = popup.querySelector("#pp-forget");
  if (forget) forget.onclick = async () => {
    try {
      await api("/api/words/forget", { method: "POST", body: { word: norm } });
      if (el) setStatus(el, norm, "new");
      markRecent(norm, "new");
      hidePopup();
    } catch (e3) { showPopupError(e3.message); }
  };
  const ai = popup.querySelector("#pp-ai");
  if (ai) ai.onclick = async () => {
    const box = popup.querySelector("#pp-ai-box");
    box.innerHTML = `<div class="pt">✨ 生成中…</div>`;
    ai.disabled = true;
    try {
      const r2 = await api("/api/ai/example", { method: "POST", body: { word: e2?.word ?? norm } });
      box.innerHTML = `<div class="pd ai-ex">${esc(r2.sentence)}${r2.zh ? `<br><span style="color:var(--dim)">${esc(r2.zh)}</span>` : ""}</div>`;
    } catch (e3) {
      box.innerHTML = `<div class="pt">⚠️ ${esc(e3.message)}</div>`;
      ai.disabled = false;
    }
    if (el) positionPopup(popup, el);
  };
}

function showPopupError(msg) {
  const popup = document.getElementById("popup");
  const box = popup.querySelector("#pp-ai-box");
  if (box) box.innerHTML = `<div class="pt" style="color:var(--red)">⚠️ ${esc(msg)}</div>`;
}

function extractSentence(el) {
  const pane = el.closest("#reading-pane");
  const text = pane.textContent;
  const at = text.indexOf(el.textContent);
  return text.slice(Math.max(0, at - 80), at + el.textContent.length + 90).trim().slice(0, 240);
}

function setStatus(el, norm, status) {
  el.className = `w w-${status}`;
  if (currentStatuses) currentStatuses[norm] = status;
}

function positionPopup(popup, el) {
  const r = el.getBoundingClientRect();
  popup.style.left = "0px"; popup.style.top = "0px";
  popup.style.visibility = "hidden";
  requestAnimationFrame(() => {
    const pw = popup.offsetWidth, ph = popup.offsetHeight;
    let x = Math.min(Math.max(12, r.right + 10), window.innerWidth - pw - 16);
    if (r.right + pw + 20 > window.innerWidth) x = Math.max(12, r.left - pw - 10);
    let y = r.top - 6;
    if (y + ph > window.innerHeight - 12) y = Math.max(12, window.innerHeight - ph - 12);
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.style.visibility = "visible";
  });
}

function centerPopup(popup) {
  popup.style.left = "0px"; popup.style.top = "0px";
  popup.style.visibility = "hidden";
  requestAnimationFrame(() => {
    popup.style.left = `${Math.max(12, (window.innerWidth - popup.offsetWidth) / 2)}px`;
    popup.style.top = `${Math.max(12, window.innerHeight * 0.25)}px`;
    popup.style.visibility = "visible";
  });
}

function hidePopup() {
  document.getElementById("popup").classList.add("hidden");
  removePopupKeys();
}
function outsideClick(e) {
  const popup = document.getElementById("popup");
  if (!popup.classList.contains("hidden") && !popup.contains(e.target) && !e.target.closest(".w") && !e.target.closest(".word-row")) hidePopup();
}
document.addEventListener("click", outsideClick, true);

function hint(main, msg) {
  const el = main.querySelector(".inline-hint");
  if (el) { el.textContent = msg; el.classList.remove("hidden"); return; }
  const d = document.createElement("div");
  d.className = "inline-hint";
  d.style.cssText = "color:var(--amber); font-size:13px; margin-top:10px";
  d.textContent = msg;
  main.querySelector(".card").appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
/** 与服务端 normalizeWord 保持一致(否则弹卡与全文高亮的键不一致) */
function normWord(w) {
  let x = w.toLowerCase().replace(/[’‘]/g, "'").replace(/['’-]+$/g, "");
  if (x.length >= 5 && x.endsWith("'s")) x = x.slice(0, -2);
  return x;
}
