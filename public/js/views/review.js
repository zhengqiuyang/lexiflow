/** 复习视图:SM-2 卡片 */
import { api, speak } from "../api.js";
import { icon } from "../icons.js";

let queue = [];
let idx = 0;
let revealed = false;
let current = null;
let sessionReviewed = 0;
let sessionStart = 0;

export async function render(view) {
  window.__steps = (window.__steps ?? []); window.__steps.push("review:start");
  const r = await api("/api/review/queue");
  window.__steps.push("queue:" + (r.cards ? r.cards.length : "ERR"));
  queue = r.cards;
  idx = 0;
  const forecast = await api("/api/review/forecast");
  window.__steps.push("forecast-ok");

  view.innerHTML = `
    <h1>${icon("review", 20)} 复习</h1>
    <div class="hint">SM-2 间隔重复:忘记的今天再见,记得的按遗忘曲线拉远。</div>
    <div class="progress-line">到期 <b>${r.totalDue}</b> · 队列加载 ${queue.length} 张 · 今日已复习 ${r.reviewedToday} 次 ·
      未来 7 天: ${forecast.buckets.map((b, i) => `D+${i + 1}:${b}`).join(" · ")}</div>
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
    if (sessionReviewed > 0) {
      const mins = Math.max(1, Math.round((Date.now() - sessionStart) / 60000));
      area.innerHTML = `
        <div class="flashcard card summary">
          <div class="sum-icon">${icon("check", 34)}</div>
          <div class="fw" style="font-size:26px">本轮完成!</div>
          <div class="sum-row"><b>${sessionReviewed}</b> 张卡片 · 用时约 <b>${mins}</b> 分钟</div>
          <div class="sum-row" style="color:var(--dim)">它们已按遗忘曲线排期——下次见面时间各不相同。</div>
          <div class="grade-row">
            <button class="primary" id="sum-read">${icon("read", 16)} 去阅读收新词</button>
            <button id="sum-books">${icon("books", 16)} 去词书</button>
          </div>
        </div>`;
      area.querySelector("#sum-read").onclick = () => { location.hash = "#/read"; };
      area.querySelector("#sum-books").onclick = () => { location.hash = "#/books"; };
    } else {
      area.innerHTML = `
        <div class="flashcard card"><div class="empty">队列空了 🎉<br><br>
          <button class="primary" id="empty-books">${icon("books", 16)} 去词书学新词</button>
          <button id="empty-read" style="margin-left:10px">${icon("read", 16)} 去阅读收词</button></div></div>`;
      area.querySelector("#empty-books").onclick = () => { location.hash = "#/books"; };
      area.querySelector("#empty-read").onclick = () => { location.hash = "#/read"; };
    }
    return;
  }
  if (sessionReviewed === 0) sessionStart = Date.now();
  current = queue[idx];
  revealed = false;
  area.innerHTML = `
    <div class="flashcard card">
      <div class="progress-line">
        <svg width="26" height="26" viewBox="0 0 26 26" style="vertical-align:middle">
          <circle cx="13" cy="13" r="10" fill="none" stroke="var(--bg2)" stroke-width="3"/>
          <circle cx="13" cy="13" r="10" fill="none" stroke="var(--accent)" stroke-width="3"
            stroke-dasharray="${(idx / queue.length * 62.8).toFixed(1)} 62.8" transform="rotate(-90 13 13)" stroke-linecap="round"/>
        </svg>
        ${idx + 1} / ${queue.length} · 来源 ${esc(current.source || "reading")}
      </div>
      <div class="fw" id="fw">${esc(current.word)}</div>
      <button id="f-speak" class="mt">🔊 发音</button>
      ${current.context ? `<div class="fctx">“${esc(current.context)}”</div>` : ""}
      <div class="mt"><button id="f-reveal" class="primary">显示答案 <kbd>Space</kbd></button></div>
      <div id="f-answer" class="fdef hidden"></div>
      <div id="f-grades" class="grade-row hidden">
        <button class="bad" data-q="2">忘记 <kbd>1</kbd></button>
        <button class="warn" data-q="3">模糊 <kbd>2</kbd></button>
        <button class="good" data-q="5">记得 <kbd>3</kbd></button>
      </div>
    </div>`;

  area.querySelector("#f-speak").onclick = () => speak(current.word);
  speak(current.word);
  area.querySelector("#f-reveal").onclick = revealCard;
  area.querySelectorAll("#f-grades button").forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        await api("/api/review/grade", { method: "POST", body: { word: current.word, q: Number(b.dataset.q) } });
        sessionReviewed++;
        idx++;
        renderCard(view);
      } catch (e) {
        b.disabled = false;
        area.querySelector("#f-answer").innerHTML += `<div style="color:var(--red); margin-top:8px">⚠️ 打分失败:${esc(e.message)}(可重试)</div>`;
      }
    };
  });

  async function revealCard() {
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
  }
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
