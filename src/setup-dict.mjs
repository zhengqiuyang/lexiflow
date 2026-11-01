/**
 * npm run setup:下载 ECDICT(词典范本)与 lemma 表 → 导入 data/dict.db。
 * 下载顺序:raw 直连(3 次重试)→ gh-proxy.com 镜像;也支持手动把文件放进 data/incoming。
 */
import { createWriteStream, existsSync, mkdirSync, statSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseCsvRows } from "./csv.mjs";
import { buildLemmaMap } from "./lemma.mjs";
import { dataDir } from "./db.mjs";

const FILES = {
  "ecdict.csv": ["https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv", 66_009_548],
  "lemma.en.txt": ["https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt", 2_318_694],
};
const MIRROR = "https://gh-proxy.com/";

const BOOKS = [
  ["zk", "中考"], ["gk", "高考"], ["cet4", "四级"], ["cet6", "六级"],
  ["ky", "考研"], ["toefl", "托福"], ["ielts", "雅思"], ["gre", "GRE"],
];

const log = (...a) => console.log(...a);

async function download(name, url, expectedSize) {
  const incoming = join(dataDir(), "incoming");
  mkdirSync(incoming, { recursive: true });
  const dest = join(incoming, name);

  // 手动放置的文件优先
  if (existsSync(dest) && statSync(dest).size === expectedSize) {
    log(`✓ ${name} 已存在(data/incoming),跳过下载`);
    return dest;
  }

  const urls = [url, MIRROR + url];
  for (const u of urls) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        log(`↓ 下载 ${name}(第 ${attempt} 次,${u.includes("gh-proxy") ? "镜像" : "直连"})…`);
        const res = await fetch(u, { signal: AbortSignal.timeout(120_000), redirect: "follow" });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const total = Number(res.headers.get("content-length") ?? expectedSize);
        let got = 0;
        const file = createWriteStream(dest);
        for await (const chunk of res.body) {
          file.write(chunk);
          got += chunk.length;
          if (total) process.stdout.write(`\r  ${(got / 1e6).toFixed(1)}/${(total / 1e6).toFixed(1)} MB (${((got / total) * 100).toFixed(0)}%)`);
        }
        await new Promise((ok, bad) => file.end(ok, bad));
        process.stdout.write("\n");
        if (statSync(dest).size < expectedSize * 0.9) throw new Error(`文件不完整(${statSync(dest).size} B)`);
        return dest;
      } catch (e) {
        log(`  失败: ${e.message}`);
        try { rmSync(dest, { force: true }); } catch { /* 忽略 */ }
      }
    }
  }
  throw new Error(`${name} 下载失败。请手动下载:\n  ${url}\n放到 ${join(dataDir(), "incoming")} 后重跑 npm run setup`);
}

async function main() {
  log("=== LexiFlow 词典初始化 ===");
  const dir = dataDir();
  const dictPath = join(dir, "dict.db");

  // 已就绪则跳过(--force 重建)
  const force = process.argv.includes("--force");
  if (!force && existsSync(dictPath)) {
    const db = new DatabaseSync(dictPath, { readOnly: true });
    const row = db.prepare("SELECT COUNT(*) c FROM stardict").get();
    db.close();
    if (row.c > 0) {
      log(`✓ 词典已就绪(${row.c} 词条),跳过。重建请加 --force`);
      return;
    }
  }

  // 1) 下载
  const csvPath = await download("ecdict.csv", FILES["ecdict.csv"][0], FILES["ecdict.csv"][1]);
  const lemmaPath = await download("lemma.en.txt", FILES["lemma.en.txt"][0], FILES["lemma.en.txt"][1]);

  // 2) 建库
  log("→ 建立词典数据库…");
  try { rmSync(dictPath, { force: true }); } catch { /* 无 */ }
  const db = new DatabaseSync(dictPath);
  db.exec("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;");
  db.exec(`
    CREATE TABLE stardict(
      word TEXT PRIMARY KEY COLLATE NOCASE, sw TEXT, phonetic TEXT,
      definition TEXT, translation TEXT, pos TEXT,
      collins INTEGER, oxford INTEGER, tag TEXT,
      bnc INTEGER, frq INTEGER, exchange TEXT);
    CREATE TABLE lemma(variant TEXT PRIMARY KEY, lemma TEXT NOT NULL);
    CREATE TABLE book_word(book TEXT NOT NULL, word TEXT NOT NULL, PRIMARY KEY(book, word));
  `);

  // 3) 导入 CSV(流式行回调 + 事务批插)
  log("→ 导入词条…");
  const text = readFileSync(csvPath, "utf8");
  const insert = db.prepare(
    "INSERT OR REPLACE INTO stardict(word,sw,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  const sw = w => w.toLowerCase().replace(/[^a-z]/g, "");
  let count = 0, batch = [], lineNo = 0;
  const t0 = Date.now();
  parseCsvRows(text, row => {
    if (lineNo++ === 0) return;                 // 表头
    if (row.length < 12) return;
    batch.push([row[0], sw(row[0]), row[1], row[2], row[3], row[4],
      parseInt(row[5]) || 0, parseInt(row[6]) || 0, row[7], parseInt(row[8]) || 0, parseInt(row[9]) || 0, row[10]]);
    if (batch.length >= 5000) {
      db.exec("BEGIN");
      for (const p of batch) insert.run(...p);
      db.exec("COMMIT");
      count += batch.length;
      batch = [];
      process.stdout.write(`\r  ${count} 词条…`);
    }
  });
  if (batch.length) {
    db.exec("BEGIN");
    for (const p of batch) insert.run(...p);
    db.exec("COMMIT");
    count += batch.length;
  }
  log(`\n✓ ${count} 词条(${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // 4) lemma 表
  log("→ 导入词形还原表…");
  const lemmaText = readFileSync(lemmaPath, "utf8");
  const lemmaMap = buildLemmaMap(lemmaText);
  const insLemma = db.prepare("INSERT OR REPLACE INTO lemma(variant, lemma) VALUES(?, ?)");
  db.exec("BEGIN");
  for (const [variant, lemma] of lemmaMap) insLemma.run(variant, lemma);
  db.exec("COMMIT");
  log(`✓ ${lemmaMap.size} 词形映射`);

  // 5) 词书表(tag → book)
  log("→ 生成词书…");
  const insBook = db.prepare("INSERT OR IGNORE INTO book_word(book, word) VALUES(?, ?)");
  const rows = db.prepare("SELECT word, tag FROM stardict WHERE tag != ''").iterate();
  const counts = Object.fromEntries(BOOKS.map(([t]) => [t, 0]));
  db.exec("BEGIN");
  for (const r of rows) {
    for (const t of String(r.tag).split(" ")) {
      if (counts[t] !== undefined) { insBook.run(t, r.word); counts[t]++; }
    }
  }
  db.exec("COMMIT");
  log("✓ 词书:" + BOOKS.map(([t, name]) => `${name} ${counts[t]}`).join(" · "));

  db.close();
  log(`\n=== 完成!词典: ${dictPath} ===`);
}

main().catch(e => {
  console.error("setup 失败:", e.message);
  process.exit(1);
});
