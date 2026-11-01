/** AI 对话视图:场景化口语/写作陪练(BYO key) */
import { api, speak } from "../api.js";
import { icon } from "../icons.js";

let scenario = "daily";

const SCEN = [
  ["daily", "💬 日常闲聊"], ["ielts", "🎓 雅思口语"], ["interview", "💼 英文面试"], ["writing", "✍️ 写作批改"],
];

export async function render(view) {
  const status = await api("/api/status");
  const history = status.aiConfigured ? await api(`/api/ai/history?scenario=${scenario}`) : { messages: [] };

  view.innerHTML = `
    <h1>${icon("chat", 20)} AI 对话</h1>
    <div class="hint">自带 API key(OpenAI 兼容:GLM / DeepSeek / OpenAI / Ollama 均可),对话成本 ≈ 纯 API 费。语音识别需 Edge/Chrome。</div>
    ${status.aiConfigured ? "" : `<div class="card" style="border-color:var(--amber)">⚠️ 尚未配置 AI:请到 <a href="#/settings" style="color:var(--accent)">设置</a> 填写 Base URL、API Key 与模型名。其余模块不受影响。</div>`}
    <div class="chips" id="scen-chips">
      ${SCEN.map(([k, n]) => `<span class="chip ${k === scenario ? "active" : ""}" data-k="${k}">${n}</span>`).join("")}
    </div>
    <div class="chat-box card">
      <div class="chat-msgs" id="chat-msgs"></div>
      <div class="chat-input">
        <input id="chat-in" placeholder="${status.aiConfigured ? "用英文说点什么…(回车发送)" : "先配置 AI 再开始"}" ${status.aiConfigured ? "" : "disabled"}>
        <button id="chat-mic" class="hidden" title="语音输入">🎤</button>
        <button id="chat-send" class="primary" ${status.aiConfigured ? "" : "disabled"}>发送</button>
      </div>
    </div>`;

  const msgs = view.querySelector("#chat-msgs");
  for (const m of history.messages) addBubble(msgs, m.role, m.content);
  scrollBottom();

  view.querySelectorAll("#scen-chips .chip").forEach(c => {
    c.onclick = async () => {
      scenario = c.dataset.k;
      view.querySelectorAll("#scen-chips .chip").forEach(x => x.classList.toggle("active", x === c));
      const h = await api(`/api/ai/history?scenario=${scenario}`);
      msgs.innerHTML = "";
      for (const m of h.messages) addBubble(msgs, m.role, m.content);
      scrollBottom();
    };
  });

  const input = view.querySelector("#chat-in");
  const send = view.querySelector("#chat-send");
  async function doSend() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    addBubble(msgs, "user", text);
    scrollBottom();
    send.disabled = true;
    const typing = addBubble(msgs, "ai", "…");
    scrollBottom();
    try {
      const r = await api("/api/ai/chat", { method: "POST", body: { scenario, message: text } });
      typing.textContent = r.content;
      speak(r.content.replace(/📝[\s\S]*$/, "").slice(0, 300));
    } catch (e) {
      typing.textContent = "⚠️ " + e.message;
    }
    send.disabled = false;
    scrollBottom();
  }
  send.onclick = doSend;
  input.onkeydown = e => { if (e.key === "Enter") doSend(); };

  // 语音识别(可选)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && status.aiConfigured) {
    const mic = view.querySelector("#chat-mic");
    mic.classList.remove("hidden");
    let rec = null;
    mic.onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = "en-US";
      mic.style.background = "var(--red)";
      rec.onresult = e => { input.value = e.results[0][0].transcript; };
      rec.onend = () => { mic.style.background = ""; rec = null; };
      rec.onerror = () => { mic.style.background = ""; rec = null; };
      rec.start();
    };
  }
}

function addBubble(msgs, role, content) {
  const el = document.createElement("div");
  el.className = `bubble ${role === "user" ? "user" : "ai"}`;
  el.textContent = content;
  msgs.appendChild(el);
  return el;
}
function scrollBottom() {
  const msgs = document.getElementById("chat-msgs");
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}
