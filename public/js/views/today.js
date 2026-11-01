/** 今日仪表盘:动线起点——3 秒知道现在该干什么 */
import { api, speak } from "../api.js";
import { icon } from "../icons.js";

export async function render(view) {
  const t = await api("/api/today");
  const pct = Math.min(100, Math.round(t.newToday / Math.max(1, t.newGoal) * 100));
  const reviewDone = t.due === 0;

  view.innerHTML = `
    <h1>${greeting()},该学英语了</h1>
    <div class="hint">${dateStr()} · 数据都在本机,随时可带走</div>

    <div class="today-grid">
      <div class="card hero ${reviewDone ? "done" : ""}" id="t-review">
        <div class="hero-icon" style="color:${reviewDone ? "var(--green)" : "var(--accent)"}">${icon("review", 26)}</div>
        <div class="hero-num">${t.due}</div>
        <div class="hero-t">${reviewDone ? "复习队列已清空 🎉" : "张卡片待复习"}</div>
        ${t.reviewedToday ? `<div class="hero-s">今天已复习 ${t.reviewedToday} 次</div>` : ""}
        <button class="primary" id="t-review-btn">${reviewDone ? icon("books", 16) + " 去学新词" : icon("arrow", 16) + " 开始复习"}</button>
      </div>

      <div class="card" id="t-new">
        <div class="hero-icon" style="color:var(--amber)">${icon("zap", 24)}</div>
        <div class="hero-num">${t.newToday}<span class="dim-num">/${t.newGoal}</span></div>
        <div class="hero-t">今日新词进度</div>
        <div class="bar mt"><div style="width:${pct}%"></div></div>
        <button id="t-books-btn">${icon("books", 16)} 去词书</button>
      </div>

      <div class="card" id="t-streak">
        <div class="hero-icon" style="color:var(--red)">${icon("flame", 24)}</div>
        <div class="hero-num">${t.streak}</div>
        <div class="hero-t">连击天数</div>
        <div class="hero-s">${t.streak === 0 ? "今天学一下就续上了" : "保持节奏,断了也不焦虑"}</div>
      </div>

      <div class="card" id="t-vocab">
        <div class="hero-icon" style="color:var(--green)">${icon("check", 24)}</div>
        <div class="hero-num">${t.vocab}</div>
        <div class="hero-t">词汇量(生词本+已认识)</div>
        <div class="hero-s">查过的词都在积累</div>
      </div>
    </div>

    <div class="card mt">
      <div class="row" style="justify-content:space-between">
        <div style="font-weight:600">${icon("doc", 16)} 继续阅读</div>
        <button id="t-newdoc">${icon("plus", 14)} 新文档</button>
      </div>
      <div id="t-docs" class="mt">
        ${t.recentDocs.length
          ? t.recentDocs.map(d => `<span class="doc-chip" data-id="${d.id}">${icon("doc", 14)} ${esc(d.title)}</span>`).join("")
          : `<span class="hero-s">还没有文档——从一篇英文文章开始</span>`}
      </div>
    </div>`;

  view.querySelector("#t-review-btn").onclick = () => { location.hash = reviewDone ? "#/books" : "#/review"; };
  view.querySelector("#t-books-btn").onclick = () => { location.hash = "#/books"; };
  view.querySelector("#t-newdoc").onclick = () => { location.hash = "#/read"; sessionStorage.setItem("lexiflow:newdoc", "1"); };
  view.querySelectorAll(".doc-chip").forEach(c => {
    c.onclick = () => { sessionStorage.setItem("lexiflow:opendoc", c.dataset.id); location.hash = "#/read"; };
  });
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好";
}

function dateStr() {
  const d = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week}`;
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
