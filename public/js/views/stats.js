/** 统计视图:热力图 + 总量 + 词汇量 */
import { api } from "../api.js";
import { icon } from "../icons.js";

export async function render(view) {
  const s = await api("/api/stats");

  // 84 天 → 7 行 × 12 列热力图(列=周)
  const byDay = Object.fromEntries(s.heatmap.map(d => [d.day, d.n]));
  const cells = [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 83);
  // 对齐到周一开头
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  for (let i = 0; i < 12 * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toLocaleDateString("sv-SE");
    const n = byDay[key] ?? (d <= today ? 0 : -1);
    const level = n <= 0 ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 40 ? 3 : 4;
    cells.push(`<div class="hm-cell ${level > 0 ? "hm-" + level : ""}" title="${key}: ${n < 0 ? "" : n + " 次"}"></div>`);
  }

  view.innerHTML = `
    <h1>${icon("stats", 20)} 统计</h1>
    <div class="hint">数据全部在本机 data/ 目录,可随时打包带走。</div>
    <div class="stat-row">
      <div class="stat-card"><div class="n" style="color:var(--green)">${s.vocabEstimate}</div><div class="t">词汇量(生词本+已认识)</div></div>
      <div class="stat-card"><div class="n">${s.cards}</div><div class="t">生词本</div></div>
      <div class="stat-card"><div class="n">${s.known}</div><div class="t">已认识(标记)</div></div>
      <div class="stat-card"><div class="n" style="color:var(--amber)">${s.dueToday}</div><div class="t">今日待复习</div></div>
      <div class="stat-card"><div class="n" style="color:var(--accent)">${s.streak}</div><div class="t">连击天数</div></div>
      <div class="stat-card"><div class="n">${s.total.lookups}</div><div class="t">累计查词</div></div>
      <div class="stat-card"><div class="n">${s.total.reviews}</div><div class="t">累计复习</div></div>
    </div>
    <div class="card">
      <div style="color:var(--dim); font-size:13px; margin-bottom:12px">最近 12 周活跃度</div>
      <div class="heatmap">${cells.join("")}</div>
      <div class="hint" style="margin-top:10px">越绿越活跃。没有连击焦虑——断了明天再来就行。</div>
    </div>`;
}
