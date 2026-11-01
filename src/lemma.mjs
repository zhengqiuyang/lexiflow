/**
 * lemma.en.txt → 变形词→原型 映射。
 * 文件格式:`lemma/词频 -> 变体1,变体2,...`(基于 BNC 语料,95% 覆盖)。
 */
export function buildLemmaMap(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const arrow = line.indexOf("->");
    if (arrow < 0) continue;
    const left = line.slice(0, arrow).trim();
    const slash = left.indexOf("/");
    const lemma = (slash >= 0 ? left.slice(0, slash) : left).trim().toLowerCase();
    if (!lemma) continue;
    const right = line.slice(arrow + 2).trim();
    if (!right) continue;
    for (const variant of right.split(",")) {
      const v = variant.trim().toLowerCase();
      if (v && !map.has(v)) map.set(v, lemma);
    }
  }
  return map;
}

/**
 * 查词形原型:map 命中优先;否则规则剥后缀给"候选"。
 * 返回值可能未经词典验证(调用方需再查词典,查不到就用原词)。
 */
export function lookupLemma(map, word) {
  const w = word.toLowerCase();
  if (map.has(w)) return map.get(w);
  for (const suffix of ["s", "es", "ed", "ing", "d"]) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (map.has(stem)) return stem;
      if (suffix === "ed" || suffix === "ing") {
        // 双写辅音:stopped → stopp → 去尾 p → stop
        const unDoubled = stem.slice(0, -1);
        if (stem.length > 2 && map.has(unDoubled)) return unDoubled;
      }
      return stem;   // 未验证候选,交给词典验证
    }
  }
  return null;
}
