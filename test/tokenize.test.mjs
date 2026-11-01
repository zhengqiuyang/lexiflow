import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, normalizeWord } from "../src/tokenize.mjs";

test("分词:偏移保留", () => {
  const text = "Hello world, don't stop.";
  const t = tokenize(text);
  assert.equal(t.length, 4);
  assert.deepEqual(t[0], { w: "Hello", start: 0, end: 5 });
  const last = t[t.length - 1];
  assert.equal(text.slice(last.start, last.end), "stop");
});

test("撇号与连字符词", () => {
  const t = tokenize("state-of-the-art design, it’s fine");
  const words = t.map(x => x.w);
  assert.deepEqual(words, ["state-of-the-art", "design", "it’s", "fine"]);
});

test("归一化:小写/弯引号/所有格/尾连字符", () => {
  assert.equal(normalizeWord("Hello"), "hello");
  assert.equal(normalizeWord("it’s"), "it's");
  assert.equal(normalizeWord("dog's"), "dog");
  assert.equal(normalizeWord("dogs-"), "dogs");
});
