import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsvRows } from "../src/csv.mjs";

test("基础逗号分割", () => {
  const rows = [];
  parseCsvRows("a,b,c\nd,e,f", r => rows.push(r));
  assert.deepEqual(rows, [["a", "b", "c"], ["d", "e", "f"]]);
});

test("引号内逗号与换行(ECDICT translation 场景)", () => {
  const rows = [];
  parseCsvRows('word,"定义一\r\n定义二",x', r => rows.push(r));
  assert.deepEqual(rows, [["word", "定义一\r\n定义二", "x"]]);
});

test("引号内双引号转义(RFC4180:仅引号字段内转义)", () => {
  const rows = [];
  parseCsvRows('"say ""hi"" now",2', r => rows.push(r));
  assert.deepEqual(rows, [['say "hi" now', "2"]]);
});

test("引号内逗号不切分", () => {
  const rows = [];
  parseCsvRows('a,"b,c",d', r => rows.push(r));
  assert.deepEqual(rows, [["a", "b,c", "d"]]);
});

test("CRLF 与结尾无换行", () => {
  const rows = [];
  parseCsvRows("a,b\r\nc,d", r => rows.push(r));
  assert.deepEqual(rows, [["a", "b"], ["c", "d"]]);
});

test("空行跳过,末尾空字段保留", () => {
  const rows = [];
  parseCsvRows("a,b\n\nc,", r => rows.push(r));
  assert.deepEqual(rows, [["a", "b"], ["c", ""]]);
});

test("13 列 ECDICT 样例行", () => {
  const rows = [];
  parseCsvRows('hello,"hə\'ləʊ",int. hello;n. hello,n:58/v:42,0,0,"gk",12,34,"",,,', r => rows.push(r));
  assert.equal(rows[0].length, 13);
  assert.equal(rows[0][0], "hello");
});
