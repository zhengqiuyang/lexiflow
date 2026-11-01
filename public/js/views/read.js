/** 阅读视图:文档列表 + 编辑器 + 可点词阅读流 + 查词弹卡 */
import { api, speak } from "../api.js";

let currentDocId = null;
let currentStatuses = {};   // norm → status

export async function render(view) {
  const docs = (await api("/api/docs")).docs;
  view.innerHTML = `
    <h1>📖 沉浸阅读</h1>
    <div class="hint">点任意单词查义;查完一键加入生词本,自动进入复习队列。</div>
    <div class="grid2">
      <div class="card" id="doc-list">
        <div class="row"><input id="doc-title" placeholder="文档标题" style="flex:1; padding:7px 10px;"><button id="doc-save" class="primary">保存</button></div>
        <textarea id="doc-text" rows="7" placeholder="粘贴英文文章,或选择左侧文档…" class="mt"></textarea>
        <div class="row mt">
          <button id="doc-analyze" class="primary">开始阅读</button>
          <label style="margin:0; display:flex; align-items:center; gap:6px; cursor:pointer;">
            <input type="file" id="doc-file" accept=".txt,.md,.srt" class="hidden">导入文件
          </label>
        </div>
        <div id="doc-items" class="mt"></div>
      </div>
      <div>
        <div id="reading-stats" class="progress-line"></div>
        <div id="reading-pane" class="hidden"></div>
      </div>
    </div>`;

  renderDocList(docs, view);
  view.querySelector("#doc-analyze").onclick = () => analyze(view, null);
  view.querySelector("#doc-save").onclick = async () => {
    const text = view.querySelector("#doc-text").value.trim();
    if (!text) return alert("先粘贴文本再保存");
    const title = view.querySelector("#doc-title").value.trim() || text.slice(0, 20);
    const { id } = await api("/api/docs", { method: "POST", body: { title, text } });
    await rerender(view);
    await openDoc(view, id);
  };
  view.querySelector("#doc-file").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    view.querySelector("#doc-text").value = (await f.text()).slice(0, 500_000);
    view.querySelector("#doc-title").value = f.name.replace(/\.(txt|md|srt)$/i, "");
    view.querySelector("#doc-file").closest("label").textContent = `已选 ${f.name}`;
  };
}

async function rerender(view) { await render(view); }

function renderDocList(docs, view) {
  const box = view.querySelector("#doc-items");
  box.innerHTML = docs.length ? "" : `<div class="empty" style="padding:24px;">暂无文档<br>粘贴文本或导入文件开始</div>`;
  for (const d of docs) {
    const el = document.createElement("div");
    el.className = "doc-item";
    el.innerHTML = `<span>📄 ${esc(d.title)}</span><span class="del" title="删除">✕</span>`;
    el.querySelector("span").onclick = () => openDoc(view, d.id);
    el.querySelector(".del").onclick = async e => {
      e.stopPropagation();
      await api(`/api/docs/${d.id}`, { method: "DELETE" });
      await rerender(view);
    };
    box.appendChild(el);
  }
}

async function openDoc(view, id) {
  const d = await api(`/api/docs/${id}`);
  view.querySelector("#doc-title").value = d.title;
  view.querySelector("#doc-text").value = d.text;
  await analyze(view, id);
}

async function analyze(view, docId) {
  const text = view.querySelector("#doc-text").value.trim();
  if (!text) return alert("请先粘贴或输入英文文本");
  currentDocId = docId;
  const r = await api("/api/docs/analyze", { method: "POST", body: { text } });
  currentStatuses = r.statuses;

  // 渲染:按偏移输出 原文/单词 span
  const pane = view.querySelector("#reading-pane");
  pane.classList.remove("hidden");
  let html = "", pos = 0;
  for (const t of r.tokens) {
    if (t.start > pos) html += esc(text.slice(pos, t.start));
    const norm = normWord(t.w);
    const st = r.statuses[norm] ?? "new";
    html += `<span class="w w-${st}" data-norm="${escAttr(norm)}" data-raw="${escAttr(t.w)}">${esc(t.w)}</span>`;
    pos = t.end;
  }
  html += esc(text.slice(pos));
  pane.innerHTML = html;

  view.querySelector("#reading-stats").textContent =
    `共 ${r.wordCount} 词 · 认识 ${r.counts.known} · 学习中 ${r.counts.learning} · 新词 ${r.counts.new}`;
  if (docId) api(`/api/docs/${docId}/progress`, { method: "POST", body: { pos: 1 } });

  pane.onclick = e => {
    const w = e.target.closest(".w");
    if (w) showPopup(w);
  };
}

async function showPopup(el) {
  const popup = document.getElementById("popup");
  const raw = el.dataset.raw, norm = el.dataset.norm;
  popup.classList.remove("hidden");
  popup.innerHTML = `<div class="pw">${esc(raw)}</div><div class="pt">查询中…</div>`;
  positionPopup(popup, el);

  let r;
  try { r = await api(`/api/lookup/${encodeURIComponent(norm)}`); }
  catch (e) { popup.innerHTML = `<div class="pt">查询失败:${esc(e.message)}</div>`; return; }

  const e2 = r.entry;
  const statusLine = r.status === "learning" ? `<span class="tagchip">已在生词本</span>`
    : r.status === "known" ? `<span class="tagchip">已认识</span>` : "";
  const tags = e2 ? (e2.collins > 0 ? `<span class="tagchip">★${e2.collins}</span>` : "") +
    (e2.oxford ? `<span class="tagchip">Oxford</span>` : "") +
    (e2.frq ? `<span class="tagchip">频率 #${e2.frq}</span>` : "") : "";
  const forms = e2?.forms?.length
    ? `<div class="pt">${e2.forms.map(f => `<span class="tagchip">${f.label} ${esc(f.value)}</span>`).join("")}</div>` : "";
  const aiBtn = r.aiConfigured ? `<button id="pp-ai">✨ AI 例句</button>` : "";
  popup.innerHTML = `
    <div class="pw">${esc(raw)}${e2?.phonetic ? `<span class="pp">${esc(e2.phonetic)}</span>` : ""}</div>
    <div class="pt">${r.via === "lemma" ? `原型:${esc(e2.word)} · ` : ""}${r.via === "miss" ? "词典未收录" : ""}${statusLine}${tags}</div>
    ${forms}
    ${e2 ? `<div class="pd">${esc(e2.translation || e2.definition)}</div>` : `<div class="pd">词典中没有这个词。</div>`}
    <div id="pp-ai-box"></div>
    <div class="pbtns">
      <button id="pp-speak">🔊</button>
      ${aiBtn}
      ${r.status !== "learning" ? `<button id="pp-add" class="primary">+ 生词本</button>` : ""}
      ${r.status === "known" ? `<button id="pp-forget">不再认识</button>` : `<button id="pp-known">已认识</button>`}
    </div>`;
  positionPopup(popup, el);

  popup.querySelector("#pp-speak").onclick = () => speak(e2?.word ?? norm);
  const add = popup.querySelector("#pp-add");
  if (add) add.onclick = async () => {
    const sentence = extractSentence(el);
    await api("/api/words/add", { method: "POST", body: { word: norm, lemma: e2?.word ?? "", source: currentDocId ? `doc:${currentDocId}` : "reading", context: sentence } });
    setStatus(el, norm, "learning");
    window.dispatchEvent(new Event("lexiflow:stats"));
    hidePopup();
  };
  const known = popup.querySelector("#pp-known");
  if (known) known.onclick = async () => {
    await api("/api/words/known", { method: "POST", body: { word: norm } });
    setStatus(el, norm, "known");
    window.dispatchEvent(new Event("lexiflow:stats"));
    hidePopup();
  };
  const forget = popup.querySelector("#pp-forget");
  if (forget) forget.onclick = async () => {
    await api("/api/words/forget", { method: "POST", body: { word: norm } });
    setStatus(el, norm, "new");
    window.dispatchEvent(new Event("lexiflow:stats"));
    hidePopup();
  };
  const ai = popup.querySelector("#pp-ai");
  if (ai) ai.onclick = async () => {
    const box = popup.querySelector("#pp-ai-box");
    box.innerHTML = `<div class="pt">✨ 生成中…</div>`;
    ai.disabled = true;
    try {
      const r2 = await api("/api/ai/example", { method: "POST", body: { word: e2?.word ?? norm } });
      box.innerHTML = `<div class="pd" style="border-left:2px solid var(--accent); padding-left:10px; margin-top:8px;">
        ${esc(r2.sentence)}${r2.zh ? `<br><span style="color:var(--dim)">${esc(r2.zh)}</span>` : ""}
        ${r2.cached ? `<span class="tagchip">缓存</span>` : ""}</div>`;
    } catch (e3) {
      box.innerHTML = `<div class="pt">⚠️ ${esc(e3.message)}</div>`;
      ai.disabled = false;
    }
  };
}

function extractSentence(el) {
  const pane = el.closest("#reading-pane");
  const text = pane.textContent;
  const start = Math.max(0, text.indexOf(el.textContent) - 80);
  return text.slice(start, text.indexOf(el.textContent) + el.textContent.length + 90).trim().slice(0, 240);
}

function setStatus(el, norm, status) {
  el.className = `w w-${status}`;
  if (currentStatuses) currentStatuses[norm] = status;
}

function positionPopup(popup, el) {
  const r = el.getBoundingClientRect();
  popup.style.visibility = "hidden";
  popup.style.left = "0px"; popup.style.top = "0px";
  requestAnimationFrame(() => {
    const pw = popup.offsetWidth, ph = popup.offsetHeight;
    let x = Math.min(r.left, window.innerWidth - pw - 16);
    let y = r.bottom + 8;
    if (y + ph > window.innerHeight - 12) y = Math.max(12, r.top - ph - 8);
    popup.style.left = `${Math.max(12, x)}px`;
    popup.style.top = `${y}px`;
    popup.style.visibility = "visible";
  });
}

function hidePopup() {
  document.getElementById("popup").classList.add("hidden");
  document.removeEventListener("click", outsideClick, true);
}
function outsideClick(e) {
  const popup = document.getElementById("popup");
  if (!popup.contains(e.target) && !e.target.closest(".w")) hidePopup();
}
document.addEventListener("click", outsideClick, true);

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
function normWord(w) { return w.toLowerCase().replace(/[’‘]/g, "'").replace(/['’-]+$/g, "").replace(/^'s$/, w => w); }
