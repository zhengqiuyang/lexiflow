/** 设置视图:AI 配置 + 学习偏好 + 数据导出 */
import { api } from "../api.js";

export async function render(view) {
  const s = await api("/api/settings");
  view.innerHTML = `
    <h1>⚙️ 设置</h1>
    <div class="hint">所有配置保存在本机 data/app.db,不上传。</div>
    <div class="card" style="max-width:640px">
      <h1 style="font-size:15px">AI 接口(OpenAI 兼容,可选)</h1>
      <div class="hint">支持 GLM(open.bigmodel.cn/api/paas/v4)、DeepSeek(api.deepseek.com)、OpenAI(api.openai.com/v1)、本地 Ollama(http://localhost:11434/v1)</div>
      <label>Base URL</label>
      <input id="s-base" style="width:100%" value="${esc(s.aiBase)}" placeholder="https://api.openai.com/v1">
      <label>API Key</label>
      <input id="s-key" style="width:100%" value="${esc(s.aiKey)}" placeholder="sk-…(留空保持不变)">
      <label>模型名</label>
      <input id="s-model" style="width:100%" value="${esc(s.aiModel)}" placeholder="gpt-4o-mini / glm-4-flash / deepseek-chat …">
      <div class="row mt">
        <button id="s-save" class="primary">保存</button>
        <button id="s-test">测试连接</button>
        <span id="s-test-result" style="color:var(--dim)"></span>
      </div>
    </div>
    <div class="card mt" style="max-width:640px">
      <h1 style="font-size:15px">学习偏好</h1>
      <label>每日新词配额(词书模式)</label>
      <input id="s-daily" type="number" min="1" max="100" value="${s.dailyNew}">
      <div class="mt"><button id="s-save2" class="primary">保存</button></div>
    </div>
    <div class="card mt" style="max-width:640px">
      <h1 style="font-size:15px">数据</h1>
      <div class="hint">数据目录:${esc(s.dataDir)}</div>
      <div class="row mt"><button id="s-export">导出全部数据(JSON)</button></div>
    </div>`;

  const collect = () => ({
    aiBase: view.querySelector("#s-base").value.trim(),
    aiKey: view.querySelector("#s-key").value.trim(),
    aiModel: view.querySelector("#s-model").value.trim(),
    dailyNew: Number(view.querySelector("#s-daily").value) || 10,
  });
  const save = async () => { await api("/api/settings", { method: "POST", body: collect() }); view.querySelector("#s-test-result").textContent = "✓ 已保存"; };
  view.querySelector("#s-save").onclick = save;
  view.querySelector("#s-save2").onclick = save;
  view.querySelector("#s-test").onclick = async () => {
    await save();
    const el = view.querySelector("#s-test-result");
    el.textContent = "测试中…";
    const r = await api("/api/ai/test", { method: "POST", body: {} }).catch(e => ({ ok: false, error: e.message }));
    el.textContent = r.ok ? `✓ 连接成功(${r.latencyMs}ms)` : `✗ ${r.error}`;
    el.style.color = r.ok ? "var(--green)" : "var(--red)";
  };
  view.querySelector("#s-export").onclick = async () => {
    const docs = await api("/api/docs");
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), docs: docs.docs, settings: s }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lexiflow-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
