/** 英文分词:保留原文偏移,供前端高亮渲染。' 与 ’ 都视为词内字符(归一化处理由调用方做)。 */

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;

export function tokenize(text) {
  const tokens = [];
  for (const m of text.matchAll(WORD_RE)) {
    tokens.push({ w: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** 词的归一键:小写、弯引号转直引号、长词去所有格 ’s/'s(缩写 it's/let's 类保留判定见下)。 */
export function normalizeWord(raw) {
  let w = raw.toLowerCase().replace(/[’‘]/g, "'").replace(/['’-]+$/g, "");
  // 去所有格仅对足够长的词(it's 这类缩写保留原形)
  if (w.length >= 5 && w.endsWith("'s")) w = w.slice(0, -2);
  return w;
}
