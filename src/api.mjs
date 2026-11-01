/** LexiFlow 全部 API 路由。返回 null = 404。 */
import { getAppDb, getDictDb, dictReady, bumpActivity, getSetting, setSetting, dataDir } from "./db.mjs";
import { tokenize, normalizeWord } from "./tokenize.mjs";
import { schedule } from "./sm2.mjs";

const SCENARIOS = {
  daily: "You are a friendly English conversation partner. Keep replies short (2-3 sentences), ask a follow-up question. The user's level is around B1. If the user makes a language mistake, first reply naturally, then add a line starting with '📝 Correction:' explaining the fix in Chinese.",
  ielts: "You are an IELTS speaking examiner-style partner. Ask one Part-1 style question at a time. After the user answers, give a band estimate (4-8), one natural upgrade suggestion, and 2 useful expressions with Chinese gloss, prefixed with '📝 Feedback:'.",
  interview: "You are an English job interviewer at a tech company. Ask realistic interview questions one at a time. After each answer, respond in character, then add '📝 Feedback:' with 2-3 improved phrasings in English plus brief Chinese notes.",
  writing: "You are an English writing coach. The user submits a paragraph; you return: 1) corrected version, 2) bullet list of mistakes with Chinese explanations, 3) one upgraded sentence pattern.",
};

function json(res2, obj) { return obj; }

function entryRow(r) {
  return {
    word: r.word, phonetic: r.phonetic ?? "",
    definition: r.definition ?? "", translation: r.translation ?? "",
    pos: r.pos ?? "", collins: r.collins ?? 0, oxford: r.oxford ?? 0,
    tag: r.tag ?? "", bnc: r.bnc ?? 0, frq: r.frq ?? 0, exchange: r.exchange ?? "",
  };
}

function getEntry(word) {
  const dict = getDictDb();
  if (!dict) return null;
  return dict.prepare("SELECT * FROM stardict WHERE word = ?").get(word) ?? null;
}

function wordStatus(norm) {
  const db = getAppDb();
  if (db.prepare("SELECT word FROM cards WHERE word = ?").get(norm)) return "learning";
  if (db.prepare("SELECT word FROM known_words WHERE word = ?").get(norm)) return "known";
  return "new";
}

export async function handleApi(method, pathname, search, body) {
  const db = getAppDb();
  const parts = pathname.split("/").filter(Boolean);   // ["api", ...]

  // ---- status ----
  if (method === "GET" && pathname === "/api/status") {
    return json(null, {
      app: "LexiFlow 词流", dictReady: dictReady(),
      cards: db.prepare("SELECT COUNT(*) c FROM cards").get().c,
      known: db.prepare("SELECT COUNT(*) c FROM known_words").get().c,
      aiConfigured: Boolean(getSetting("aiKey") && getSetting("aiBase")),
    });
  }

  // ---- lookup ----
  if (method === "GET" && parts[1] === "lookup" && parts[2]) {
    const raw = decodeURIComponent(parts[2]);
    const norm = normalizeWord(raw);
    let via = "direct", entry = getEntry(norm);
    if (!entry) {
      const dict = getDictDb();
      const lemmaRow = dict ? dict.prepare("SELECT lemma FROM lemma WHERE variant = ?").get(norm) : null;
      const lemma = lemmaRow ? lemmaRow.lemma : (norm.length > 3 && norm.endsWith("s") ? norm.slice(0, -1) : null);
      if (lemma) {
        entry = getEntry(lemma);
        if (entry) via = "lemma";
      }
    }
    bumpActivity("lookups");
    return {
      query: norm, via: entry ? via : "miss",
      entry: entry ? entryRow(entry) : null,
      status: wordStatus(norm),
    };
  }

  // ---- words ----
  if (method === "POST" && pathname === "/api/words/add") {
    const word = normalizeWord(body.word);
    if (!word) return { error: "word required" };
    db.prepare(`INSERT INTO cards(word, lemma, source, context, due_ms, added_ms, last_ms)
                VALUES(?,?,?,?,?,?,?)`)
      .run(word, body.lemma ?? "", body.source ?? "reading", body.context ?? "", Date.now(), Date.now(), Date.now());
    db.prepare("DELETE FROM known_words WHERE word = ?").run(word);
    bumpActivity("adds"); bumpActivity("new_words");
    return { ok: true, word };
  }

  if (method === "POST" && pathname === "/api/words/known") {
    const word = normalizeWord(body.word);
    db.prepare("INSERT OR REPLACE INTO known_words(word, ms) VALUES(?, ?)").run(word, Date.now());
    db.prepare("DELETE FROM cards WHERE word = ?").run(word);
    bumpActivity("adds");
    return { ok: true, word, status: "known" };
  }

  if (method === "POST" && pathname === "/api/words/forget") {
    const word = normalizeWord(body.word);
    db.prepare("DELETE FROM known_words WHERE word = ?").run(word);
    return { ok: true, word };
  }

  // ---- review ----
  if (method === "GET" && pathname === "/api/review/queue") {
    const now = Date.now();
    const due = db.prepare("SELECT * FROM cards WHERE due_ms <= ? ORDER BY due_ms ASC LIMIT 100").all(now);
    const totalDue = db.prepare("SELECT COUNT(*) c FROM cards WHERE due_ms <= ?").get(now).c;
    const reviewedToday = (db.prepare("SELECT reviews c FROM activity WHERE day = ?")
      .get(new Date().toLocaleDateString("sv-SE")) ?? { c: 0 }).c;
    return { totalDue, reviewedToday, cards: due.map(c => ({
      word: c.word, context: c.context, source: c.source,
      ease: c.ease, interval: c.interval, reps: c.reps,
    })) };
  }

  if (method === "POST" && pathname === "/api/review/grade") {
    const row = db.prepare("SELECT * FROM cards WHERE word = ?").get(normalizeWord(body.word));
    if (!row) return { error: "card not found" };
    const next = schedule(row, body.q, Date.now());
    db.prepare(`UPDATE cards SET ease=?, interval=?, reps=?, lapses=?, due_ms=?, last_ms=? WHERE word=?`)
      .run(next.ease, next.interval, next.reps, next.lapses, next.dueMs, next.lastMs, row.word);
    bumpActivity("reviews");
    return { ok: true, nextIntervalDays: next.interval };
  }

  if (method === "GET" && pathname === "/api/review/forecast") {
    const now = Date.now();
    const rows = db.prepare(`SELECT due_ms FROM cards WHERE due_ms > ?`).all(now);
    const buckets = Array(7).fill(0);
    for (const r of rows) {
      const day = Math.floor((r.due_ms - now) / 86_400_000);
      if (day >= 0 && day < 7) buckets[day]++;
    }
    return { buckets };
  }

  // ---- books ----
  if (method === "GET" && pathname === "/api/books") {
    const dict = getDictDb();
    if (!dict) return { error: "词典未初始化,请先运行 npm run setup" };
    // cards 在 app.db、book_word 在 dict.db:分开查,JS 侧合并(跨库不能 JOIN)
    const cardWords = new Set(db.prepare("SELECT word FROM cards").all().map(r => r.word));
    const books = [["zk", "中考"], ["gk", "高考"], ["cet4", "大学四级"], ["cet6", "大学六级"],
      ["ky", "考研"], ["toefl", "TOEFL"], ["ielts", "IELTS"], ["gre", "GRE"]].map(([tag, name]) => {
      const total = dict.prepare("SELECT COUNT(*) c FROM book_word WHERE book = ?").get(tag).c;
      const words = dict.prepare("SELECT word FROM book_word WHERE book = ?").all(tag).map(r => r.word);
      const added = words.reduce((n, w) => n + (cardWords.has(w) ? 1 : 0), 0);
      return { tag, name, total, added };
    });
    return { books };
  }

  if (method === "GET" && parts[1] === "books" && parts[3] === "words") {
    const tag = parts[2];
    const dict = getDictDb();
    const offset = Number(search.get("offset") ?? 0), limit = Math.min(100, Number(search.get("limit") ?? 50));
    const rows = dict.prepare(`
      SELECT s.word, s.phonetic, s.translation, s.tag, s.frq,
             CASE WHEN c.word IS NULL THEN 0 ELSE 1 END AS in_cards
      FROM book_word b JOIN stardict s ON s.word = b.word
      LEFT JOIN cards c ON c.word = b.word
      WHERE b.book = ? ORDER BY (s.frq = 0) ASC, s.frq ASC LIMIT ? OFFSET ?`)
      .all(tag, limit, offset);
    return { words: rows };
  }

  if (method === "POST" && parts[1] === "books" && parts[3] === "learn") {
    const tag = parts[2];
    const dict = getDictDb();
    const count = Math.min(50, Math.max(1, Number(body.count) || Number(getSetting("dailyNew")) || 10));
    const cardWords = new Set(db.prepare("SELECT word FROM cards").all().map(r => r.word));
    const knownWords = new Set(db.prepare("SELECT word FROM known_words").all().map(r => r.word));
    const all = dict.prepare(`
      SELECT s.word, s.phonetic, s.translation, s.definition, s.frq
      FROM book_word b JOIN stardict s ON s.word = b.word WHERE b.book = ?`).all(tag);
    const rows = all
      .filter(r => !cardWords.has(r.word) && !knownWords.has(r.word))
      .sort((a, b2) => (a.frq === 0) - (b2.frq === 0) || a.frq - b2.frq)
      .slice(0, count);
    for (const r of rows) {
      const context = cleanZh(r.translation).slice(0, 120);
      db.prepare(`INSERT INTO cards(word, lemma, source, context, due_ms, added_ms, last_ms)
                  VALUES(?,?,?,?,?,?,?)`)
        .run(r.word, "", `book:${tag}`, context, Date.now(), Date.now(), Date.now());
      bumpActivity("new_words");
    }
    bumpActivity("adds", rows.length);
    return { added: rows.map(r => ({ word: r.word, phonetic: r.phonetic, translation: r.translation, definition: r.definition })) };
  }

  if (method === "GET" && parts[1] === "books" && parts[3] === "quiz") {
    const tag = parts[2];
    const dict = getDictDb();
    const count = Math.min(20, Math.max(1, Number(search.get("count")) || 5));
    const pool = dict.prepare(`
      SELECT s.word, s.translation FROM book_word b JOIN stardict s ON s.word = b.word
      WHERE b.book = ? AND s.translation != '' AND s.frq > 0 ORDER BY RANDOM() LIMIT ?`).all(tag, count * 4);
    const questions = [];
    for (let i = 0; i + 3 < pool.length && questions.length < count; i += 4) {
      const four = pool.slice(i, i + 4);
      const answer = four[0];
      const opts = four.map(x => firstZh(x.translation)).sort(() => Math.random() - 0.5);
      questions.push({
        word: answer.word,
        options: opts,
        answer: firstZh(answer.translation),
        translation: answer.translation,
      });
    }
    return { questions };
  }

  // ---- docs ----
  if (method === "GET" && pathname === "/api/docs") {
    return { docs: db.prepare("SELECT id, title, length(text) AS size, created_ms FROM docs ORDER BY created_ms DESC").all() };
  }
  if (method === "POST" && pathname === "/api/docs") {
    const title = (body.title || "").trim() || "未命名文档";
    const r = db.prepare("INSERT INTO docs(title, text, created_ms) VALUES(?,?,?)").run(title, body.text ?? "", Date.now());
    return { id: Number(r.lastInsertRowid) };
  }
  if (method === "GET" && parts[1] === "docs" && parts[2] && !parts[3]) {
    const d = db.prepare("SELECT * FROM docs WHERE id = ?").get(Number(parts[2]));
    return d ?? { error: "not found" };
  }
  if (method === "DELETE" && parts[1] === "docs" && parts[2]) {
    db.prepare("DELETE FROM docs WHERE id = ?").run(Number(parts[2]));
    db.prepare("DELETE FROM doc_progress WHERE doc_id = ?").run(Number(parts[2]));
    return { ok: true };
  }
  if (method === "POST" && pathname === "/api/docs/analyze") {
    const text = String(body.text ?? "");
    const tokens = tokenize(text);
    const wordSet = new Set();
    for (const t of tokens) wordSet.add(normalizeWord(t.w));
    const statuses = {};
    for (const w of wordSet) statuses[w] = wordStatus(w);
    const counts = { new: 0, learning: 0, known: 0 };
    for (const s of Object.values(statuses)) counts[s]++;
    return { tokens, statuses, counts, wordCount: tokens.length };
  }
  if (method === "POST" && parts[1] === "docs" && parts[3] === "progress") {
    db.prepare(`INSERT INTO doc_progress(doc_id, pos, ms) VALUES(?,?,?)
                ON CONFLICT(doc_id) DO UPDATE SET pos = MAX(pos, excluded.pos)`)
      .run(Number(parts[2]), Number(body.pos) || 0, Date.now());
    return { ok: true };
  }

  // ---- settings ----
  if (method === "GET" && pathname === "/api/settings") {
    return {
      aiBase: getSetting("aiBase") ?? "", aiKey: getSetting("aiKey") ? "•••已保存" : "",
      aiModel: getSetting("aiModel") ?? "", dailyNew: Number(getSetting("dailyNew")) || 10,
      dataDir: dataDir(),
    };
  }
  if (method === "POST" && pathname === "/api/settings") {
    for (const k of ["aiBase", "aiKey", "aiModel", "dailyNew"]) {
      if (body[k] !== undefined && body[k] !== "•••已保存") setSetting(k, String(body[k]));
    }
    return { ok: true };
  }

  // ---- ai ----
  if (method === "POST" && pathname === "/api/ai/test") {
    try {
      const t0 = Date.now();
      await aiFetch([{ role: "user", content: "Reply with exactly: OK" }], 200);
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (method === "POST" && pathname === "/api/ai/chat") {
    const scenario = SCENARIOS[body.scenario] ? body.scenario : "daily";
    const message = String(body.message ?? "").trim();
    if (!message) return { error: "message required" };
    db.prepare("INSERT INTO chat_messages(role, content, scenario, ms) VALUES(?,?,?,?)")
      .run("user", message, scenario, Date.now());
    const reply = await aiFetch(null, 0, scenario);
    return reply;
  }

  if (method === "GET" && pathname === "/api/ai/history") {
    const scenario = search.get("scenario") ?? "daily";
    const rows = db.prepare("SELECT role, content, ms FROM chat_messages WHERE scenario = ? ORDER BY id DESC LIMIT 50").all(scenario);
    return { messages: rows.reverse() };
  }

  // ---- stats ----
  if (method === "GET" && pathname === "/api/stats") {
    const day = new Date().toLocaleDateString("sv-SE");
    const days = db.prepare("SELECT * FROM activity ORDER BY day DESC LIMIT 84").all().reverse();
    const total = {
      lookups: db.prepare("SELECT COALESCE(SUM(lookups),0) s FROM activity").get().s,
      adds: db.prepare("SELECT COALESCE(SUM(adds),0) s FROM activity").get().s,
      reviews: db.prepare("SELECT COALESCE(SUM(reviews),0) s FROM activity").get().s,
    };
    const known = db.prepare("SELECT COUNT(*) c FROM known_words").get().c;
    const cards = db.prepare("SELECT COUNT(*) c FROM cards").get().c;
    const dueToday = db.prepare("SELECT COUNT(*) c FROM cards WHERE due_ms <= ?").get(Date.now()).c;
    // 连击:从今天/昨天往回,每天有任意活动
    const activeDays = new Set(db.prepare(`SELECT day FROM activity WHERE lookups+adds+reviews+new_words+ai_turns > 0`).all().map(r => r.day));
    let streak = 0;
    let cursor = new Date();
    if (!activeDays.has(day)) cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      const k = cursor.toLocaleDateString("sv-SE");
      if (!activeDays.has(k)) break;
      streak++; cursor.setDate(cursor.getDate() - 1);
    }
    return {
      heatmap: days.map(d => ({ day: d.day, n: d.lookups + d.adds + d.reviews + d.new_words + d.ai_turns })),
      total, known, cards, dueToday, streak,
      vocabEstimate: known + cards,
    };
  }

  return null;
}

function firstZh(translation) {
  const t = cleanZh(translation).split(/;|\s{2,}/)[0].trim();
  return t.slice(0, 30) || "(无释义)";
}

/** ECDICT 释义清洗:字面 \n 与真实换行都转成分号间隔的一行。 */
function cleanZh(translation) {
  return String(translation ?? "").replace(/\\n|[\r\n]+/g, "; ");
}

/** OpenAI 兼容 chat 调用;ai/chat 场景下自动带上历史。 */
async function aiFetch(messages, maxTokens, scenario) {
  const base = (getSetting("aiBase") ?? "").replace(/\/+$/, "");
  const key = getSetting("aiKey") ?? "";
  const model = getSetting("aiModel") ?? "";
  if (!base || !key || !model) {
    throw Object.assign(new Error("尚未配置 AI:请到 设置 页填写 Base URL / API Key / 模型名"), { status: 400 });
  }
  const db = getAppDb();
  const sc = scenario ?? "daily";
  let hist = [];
  if (!messages) {
    hist = db.prepare("SELECT role, content FROM chat_messages WHERE scenario = ? ORDER BY id DESC LIMIT 20").all(sc).reverse();
  }
  const payload = {
    model,
    messages: messages ?? [
      { role: "system", content: SCENARIOS[sc] ?? SCENARIOS.daily },
      ...hist,
    ],
    max_tokens: 800,
    temperature: 0.7,
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw Object.assign(new Error(`AI 接口错误 HTTP ${res.status}: ${t.slice(0, 200)}`), { status: 502 });
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "(空回复)";
  if (!messages) {   // 对话场景:回复入历史
    db.prepare("INSERT INTO chat_messages(role, content, scenario, ms) VALUES(?,?,?,?)")
      .run("assistant", content, sc, Date.now());
    bumpActivity("ai_turns");
  }
  return { content };
}
