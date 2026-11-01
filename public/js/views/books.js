/** 词书视图:8 本词书 + 学新词 + 测验 */
import { api, speak } from "../api.js";
import { icon } from "../icons.js";

let currentBook = null;

export async function render(view) {
  const { books } = await api("/api/books");
  view.innerHTML = `
    <h1>${icon("books", 20)} 词书</h1>
    <div class="hint">选择词书,按词频由常用到生僻推进;新词自动进入复习队列。闯关是索引,阅读是主体。</div>
    <div id="book-grid" class="book-grid"></div>
    <div id="book-detail" class="mt"></div>`;

  const grid = view.querySelector("#book-grid");
  for (const b of books) {
    const el = document.createElement("div");
    el.className = "book-card";
    const pct = b.total ? Math.round(b.added / b.total * 100) : 0;
    el.innerHTML = `<div class="bn">${esc(b.name)}</div><div class="bc">${b.total} 词 · 已收 ${b.added}</div>
      <div class="bar"><div style="width:${pct}%"></div></div>`;
    el.onclick = () => { currentBook = b; renderDetail(view); };
    grid.appendChild(el);
  }
  if (currentBook) renderDetail(view);
}

async function renderDetail(view) {
  const b = currentBook;
  const [words, forecast] = await Promise.all([
    api(`/api/books/${b.tag}/words?offset=0&limit=50`),
    api("/api/review/forecast"),
  ]);
  view.querySelector("#book-detail").innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h1 style="margin:0">${esc(b.name)} <span style="color:var(--dim);font-size:13px">${b.total} 词 · 已收 ${b.added}</span></h1>
        <div class="row">
          <button id="b-learn" class="primary">${icon("zap", 14)} 今日学新词</button>
          <button id="b-quiz">测验 5 题</button>
        </div>
      </div>
      <div class="hint" style="margin:10px 0 0">本书已收的词在全局复习队列里${forecast.buckets[0] > 0 ? ` · 今天有 ${forecast.buckets[0]} 张到期,` : ""}<a href="#/review" style="color:var(--accent)">去复习</a></div>
      <div id="b-content" class="mt"></div>
    </div>`;

  const content = view.querySelector("#b-content");
  content.innerHTML = words.words.map(w => `
    <div class="word-row">
      <span class="tw">${esc(w.word)} ${w.phonetic ? `<span style="color:var(--accent);font-size:12px">${esc(w.phonetic)}</span>` : ""}</span>
      <span class="tt">${esc(firstLine(w.translation))}</span>
      <span>${w.in_cards ? `<span class="tagchip">已收</span>` : ""}</span>
    </div>`).join("");

  view.querySelector("#b-learn").onclick = () => learn(view);
  view.querySelector("#b-quiz").onclick = () => quiz(view);
}

async function learn(view) {
  const btn = view.querySelector("#b-learn");
  btn.disabled = true;
  btn.textContent = "生成中…";
  try {
    const { added } = await api(`/api/books/${currentBook.tag}/learn`, { method: "POST", body: { count: 10 } });
    const content = view.querySelector("#b-content");
    content.innerHTML = added.length === 0
      ? `<div class="empty">这本词书的新词都收完了 🎉</div>`
      : `<div class="progress-line">已加入生词本 ${added.length} 词,进入复习队列:</div>` +
        added.map((w, i) => `
          <div class="word-row">
            <span class="tw">${i + 1}. ${esc(w.word)} ${w.phonetic ? `<span style="color:var(--accent);font-size:12px">${esc(w.phonetic)}</span>` : ""}</span>
            <span class="tt">${esc(firstLine(w.translation || w.definition))}</span>
            <button class="speak" data-w="${esc(w.word)}">🔊</button>
          </div>`).join("");
    content.querySelectorAll(".speak").forEach(s => s.onclick = () => speak(s.dataset.w));
    await render(view);
  } finally {
    btn.disabled = false;
    btn.textContent = "今日学新词";
  }
}

async function quiz(view) {
  const { questions } = await api(`/api/books/${currentBook.tag}/quiz?count=5`);
  const content = view.querySelector("#b-content");
  let i = 0, correct = 0;
  renderQ();

  function renderQ() {
    if (i >= questions.length) {
      content.innerHTML = `<div class="empty">测验完成:${correct} / ${questions.length} 🎯<br>答错的词已在生词本队列里等你。</div>`;
      return;
    }
    const q = questions[i];
    content.innerHTML = `
      <div class="flashcard card" style="padding:30px">
        <div class="progress-line">${i + 1} / ${questions.length}</div>
        <div class="fw" style="font-size:32px">${esc(q.word)}</div>
        <div id="q-opts" class="mt" style="display:grid; gap:10px">
          ${q.options.map(o => `<button data-o="${esc(o)}" style="text-align:left; padding:12px 16px">${esc(o)}</button>`).join("")}
        </div>
        <div id="q-result" class="mt" style="min-height:60px"></div>
      </div>`;
    speak(q.word);
    content.querySelectorAll("#q-opts button").forEach(b => {
      b.onclick = async () => {
        const ok = b.dataset.o === q.answer;
        if (ok) correct++;
        b.style.background = ok ? "var(--green)" : "var(--red)";
        content.querySelectorAll("#q-opts button").forEach(x => x.disabled = true);
        if (!ok) {
          content.querySelectorAll("#q-opts button").forEach(x => {
            if (x.dataset.o === q.answer) x.style.background = "var(--green)";
          });
          await api("/api/words/add", { method: "POST", body: { word: q.word, source: `quiz:${currentBook.tag}`, context: q.translation } });
        }
        content.querySelector("#q-result").innerHTML =
          `<div class="row" style="justify-content:space-between">
             <span>${ok ? "✓ 正确" : `✗ 正确答案:${esc(q.answer)}`}</span>
             <button id="q-next" class="primary">下一题 →</button>
           </div>`;
        content.querySelector("#q-next").onclick = () => { i++; renderQ(); };
      };
    });
  }
}

function firstLine(t) { return String(t ?? "").split(/\r?\n|;/)[0].trim().slice(0, 60); }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
