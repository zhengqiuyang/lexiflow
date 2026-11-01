/**
 * RFC4180 风格 CSV 行解析(状态机):支持引号内逗号/换行/双引号转义("")。
 * ECDICT 的 translation 字段内嵌 \r\n,必须用本解析而非按行 split。
 * parseCsvRows(text, rowFn):逐行回调,避免为 76 万行构建巨型中间数组。
 */
export function parseCsvRows(text, rowFn) {
  let field = "";
  let row = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => { row.push(field); field = ""; };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === "")) rowFn(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { endField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { endRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length > 0) endRow();
}
