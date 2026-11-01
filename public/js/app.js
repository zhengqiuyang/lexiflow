/** LexiFlow SPA 入口:hash 路由 + 侧栏状态 */
import { api } from "./api.js";
import { render as todayView } from "./views/today.js";
import { render as readView } from "./views/read.js";
import { render as reviewView } from "./views/review.js";
import { render as booksView } from "./views/books.js";
import { render as chatView } from "./views/chat.js";
import { render as statsView } from "./views/stats.js";
import { render as settingsView } from "./views/settings.js";

const routes = {
  today: todayView, read: readView, review: reviewView, books: booksView,
  chat: chatView, stats: statsView, settings: settingsView,
};

async function route() {
  const name = (location.hash.replace(/^#\//, "") || "today").split("?")[0];
  const view = routes[name] ?? routes.today;
  document.querySelectorAll(".nav-item").forEach(a => a.classList.toggle("active", a.dataset.view === name));
  const main = document.getElementById("view");
  main.innerHTML = `<div class="empty">加载中…</div>`;
  window.__steps = (window.__steps ?? []); window.__steps.push("route:" + name);
  try {
    await view(main);
    window.__steps.push("view-ok:" + name);
  } catch (e) {
    window.__steps.push("view-err:" + name + ":" + e.message);
    main.innerHTML = `<div class="card" style="border-color:var(--red)"><b>加载失败:</b>${esc(e.message)}${String(e.message).includes("词典未初始化") ? "<br><br>请先在项目目录运行 <code>npm run setup</code>" : ""}</div>`;
  }
  refreshStatus();
}

async function refreshStatus() {
  try {
    const s = await api("/api/status");
    document.getElementById("sidebar-status").innerHTML =
      `词典:${s.dictReady ? "✓ 已就绪" : "✗ 未初始化"}<br>生词本:${s.cards} · 已认识:${s.known}<br>AI:${s.aiConfigured ? "✓" : "未配置"}`;
  } catch { /* 服务未起 */ }
}

window.addEventListener("hashchange", route);
window.addEventListener("lexiflow:stats", refreshStatus);
// 异步错误不再静默:至少落到控制台,便于发现"点了没反应"类问题
window.addEventListener("unhandledrejection", e =>
  console.error("[LexiFlow] 未处理的异步错误:", e.reason));

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

route();
