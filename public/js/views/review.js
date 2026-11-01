/** 复习视图:SM-2 卡片 */
import { api, speak } from "../api.js";

let queue = [];
let idx = 0;
let revealed = false;
let current = null;

export async function render(view) {
  window.__steps = (window.__steps ?? []); window.__steps.push("review:start");
  const r = await api("/api/review/queue");
  window.__steps.push("queue:" + (r.cards ? r.cards.length : "ERR"));
  queue = r.cards;
  idx = 0;
  const forecast = await api("/api/review/forecast");
  window.__steps.push("forecast-ok");

  view.innerHTML = `
    <h1>🃏 复习</h1>
    <div class="hint">SM-2 间隔重复:忘记的今天再见,记得的按遗忘曲线拉远。</div>
    <div class="progress-line">到期 <b>${r.totalDue}</b> · 队列加载 ${queue.length} 张 · 今日已复习 ${r.reviewedToday} 次 ·
      未来 7 天: ${forecast.buckets.map((b, i) => `D+${i + 1}:${b}`).join(" · ")} · 快捷键:空格=翻面 1/2/3=打分</div>
    <div id="card-area"></div>`;

  window.__steps.push("html-set");
  installKeys(view);
  renderCard(view);
  window.__steps.push("card-done");
}

let keyHandler = null;
function installKeys(view) {
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = e => {
    if (!document.getElementById("card-area")) { document.removeEventListener("keydown", keyHandler); return; }
    if (e.key === " " && !revealed) {
      e.preventDefault();
      view.querySelector("#f-reveal")?.click();
    } else if (revealed && ["1", "2", "3"].includes(e.key)) {
      const q = { "1": 2, "2": 3, "3": 5 }[e.key];
      const btn = view.querySelector(`#f-grades button[data-q="${q}"]`);
      if (btn && !btn.disabled) btn.click();
    }
  };
  document.addEventListener("keydown", keyHandler);
}

function renderCard(view) {
  const area = view.querySelector("#card-area");
  if (idx >= queue.length) {
    area.innerHTML = `<div class="flashcard card"><div class="empty">队列空了 🎉<br>去阅读里收几个新词,或明天再来。</div></div>`;
    return;
  }
  current = queue[idx];
  revealed = false;
  area.innerHTML = `
    <div class="flashcard card">
      <div class="progress-line">${idx + 1} / ${queue.length} · 来源 ${esc(current.source || "reading")}</div>
      <div class="fw" id="fw">${esc(current.word)}</div>
      <button id="f-speak" class="mt">🔊 发音</button>
      ${current.context ? `<div class="fctx">“${esc(current.context)}”</div>` : ""}
      <div class="mt"><button id="f-reveal" class="primary">显示答案</button></div>
      <div id="f-answer" class="fdef hidden"></div>
      <div id="f-grades" class="grade-row hidden">
        <button class="bad" data-q="2">忘记</button>
        <button class="warn" data-q="3">模糊</button>
        <button class="good" data-q="5">记得</button>
      </div>
    </div>`;

  area.querySelector("#f-speak").onclick = () => speak(current.word);
  speak(current.word);
  area.querySelector("#f-reveal").onclick = async () => {
    if (revealed) return;
    revealed = true;
    const look = await api(`/api/lookup/${encodeURIComponent(current.word)}`);
    const e = look.entry;
    area.querySelector("#f-answer").innerHTML = e
      ? `${e.phonetic ? `<b style="color:var(--accent)">${esc(e.phonetic)}</b><br>` : ""}${esc(e.translation || e.definition)}`
      : "(词典未收录)";
    area.querySelector("#f-answer").classList.remove("hidden");
    area.querySelector("#f-grades").classList.remove("hidden");
    area.querySelector("#f-reveal").classList.add("hidden");
  };
  area.querySelectorAll("#f-grades button").forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      await api("/api/review/grade", { method: "POST", body: { word: current.word, q: Number(b.dataset.q) } });
      idx++;
      renderCard(view);
    };
  });
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
