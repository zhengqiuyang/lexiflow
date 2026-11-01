/** LexiFlow 服务器:node:http + 极小路由器 + 静态文件。纯 ESM,零依赖。 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./src/api.mjs";
import { getAppDb } from "./src/db.mjs";

const PORT = Number(process.env.PORT ?? 3210);
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, mime = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": mime, "Cache-Control": "no-store" });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) {
    chunks.push(c);
    if (chunks.reduce((s, c2) => s + c2.length, 0) > 10 * 1024 * 1024) throw new Error("body too large");
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname.startsWith("/api/")) {
      const body = req.method === "POST" || req.method === "PUT" ? await readBody(req) : null;
      const done = await handleApi(req.method, url.pathname, url.searchParams, body);
      if (done === null) sendJson(res, 404, { error: "not found" });
      else sendJson(res, 200, done);
      return;
    }

    // 静态文件
    let p = url.pathname === "/" ? "/index.html" : url.pathname;
    p = normalize(p).replace(/^([/\\])+/, "");
    if (p.includes("..")) return send(res, 403, "forbidden", "text/plain");
    const file = join(PUBLIC, p);
    if (!existsSync(file)) return send(res, 404, "not found", "text/plain");
    const mime = MIME[extname(file)] ?? "application/octet-stream";
    send(res, 200, await readFile(file), mime);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

getAppDb();   // 启动即建表
server.keepAliveTimeout = 65_000;    // 比浏览器空闲超时长,避免半关连接挂起请求
server.headersTimeout = 66_000;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`LexiFlow 词流 → http://127.0.0.1:${PORT}`);
});
