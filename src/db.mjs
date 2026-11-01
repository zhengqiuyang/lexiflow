import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** 数据目录:默认 lexiflow/data,环境变量 LEXIFLOW_DIR 可覆盖(测试隔离)。 */
export function dataDir() {
  const dir = process.env.LEXIFLOW_DIR ?? join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

let appDb = null;
let dictDb = null;

/** 用户数据库:卡片/文档/活动/设置/聊天。 */
export function getAppDb() {
  if (appDb) return appDb;
  const p = join(dataDir(), "app.db");
  appDb = new DatabaseSync(p);
  appDb.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
  appDb.exec(`
    CREATE TABLE IF NOT EXISTS cards(
      word TEXT PRIMARY KEY,
      lemma TEXT DEFAULT '',
      source TEXT DEFAULT '',
      context TEXT DEFAULT '',
      ease REAL NOT NULL DEFAULT 2.5,
      interval INTEGER NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      due_ms INTEGER NOT NULL DEFAULT 0,
      added_ms INTEGER NOT NULL DEFAULT 0,
      last_ms INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due_ms);
    CREATE TABLE IF NOT EXISTS known_words(
      word TEXT PRIMARY KEY, ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS docs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, text TEXT NOT NULL, created_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS doc_progress(
      doc_id INTEGER PRIMARY KEY, pos INTEGER NOT NULL, ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS activity(
      day TEXT PRIMARY KEY,
      lookups INTEGER NOT NULL DEFAULT 0, adds INTEGER NOT NULL DEFAULT 0,
      reviews INTEGER NOT NULL DEFAULT 0, new_words INTEGER NOT NULL DEFAULT 0,
      ai_turns INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_messages(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL, content TEXT NOT NULL,
      scenario TEXT NOT NULL DEFAULT 'daily', ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_examples(
      word TEXT PRIMARY KEY, sentence TEXT NOT NULL, zh TEXT NOT NULL, ms INTEGER NOT NULL);
  `);
  // 一次性数据清洗:ECDICT 释义里的字面 \n 污染了早期卡片的语境句
  appDb.prepare("UPDATE cards SET context = REPLACE(context, ?, '; ') WHERE context LIKE ?")
    .run("\\n", "%\\n%");
  return appDb;
}

/** 词典数据库(由 npm run setup 生成)。只读使用。 */
export function getDictDb() {
  if (dictDb) return dictDb;
  const p = join(dataDir(), "dict.db");
  if (!existsSync(p)) return null;
  dictDb = new DatabaseSync(p, { readOnly: true });
  return dictDb;
}

export function dictReady() {
  const p = join(dataDir(), "dict.db");
  if (!existsSync(p)) return false;
  const db = new DatabaseSync(p, { readOnly: true });
  try {
    const row = db.prepare("SELECT COUNT(*) c FROM stardict").get();
    return row.c > 0;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/** 当日活动计数 +1(activity.day 为本地 YYYY-MM-DD)。 */
export function bumpActivity(field, n = 1) {
  const db = getAppDb();
  const day = new Date().toLocaleDateString("sv-SE");   // 本地 YYYY-MM-DD
  db.prepare(`INSERT INTO activity(day, ${field}) VALUES(?, ?)
              ON CONFLICT(day) DO UPDATE SET ${field} = ${field} + ?`).run(day, n, n);
}

export function getSetting(key) {
  const row = getAppDb().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  getAppDb().prepare(`INSERT INTO settings(key, value) VALUES(?, ?)
                      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}
