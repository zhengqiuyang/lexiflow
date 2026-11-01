import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLemmaMap, lookupLemma } from "../src/lemma.mjs";

const SAMPLE = `
look/18207 -> looks, looked, looking
run/1200 -> runs, running, ran
abandon/987 -> abandons, abandoning, abandoned
stop/500 -> stops, stopping, stopped

bad line without arrow
`;

test("构建映射:变体→原型", () => {
  const m = buildLemmaMap(SAMPLE);
  assert.equal(m.get("running"), "run");
  assert.equal(m.get("looked"), "look");
  assert.equal(m.get("abandoned"), "abandon");
  assert.equal(m.size >= 8, true);
});

test("大小写归一", () => {
  const m = buildLemmaMap(SAMPLE);
  assert.equal(m.get("RUNNING"), undefined);   // map 键为小写
  assert.equal(lookupLemma(m, "Running"), "run");
});

test("lookupLemma:表命中 → 规则候选 → null(候选需调用方查词典验证)", () => {
  const m = buildLemmaMap(SAMPLE);
  assert.equal(lookupLemma(m, "looked"), "look");
  assert.equal(lookupLemma(m, "cats"), "cat");        // 表无 cat,规则剥 s 给候选
  assert.equal(lookupLemma(m, "go"), null);           // 无后缀可剥
});

test("双写辅音还原:stopped → stop(经表验证)", () => {
  const m = buildLemmaMap(SAMPLE);
  assert.equal(lookupLemma(m, "stopped"), "stop");
});
