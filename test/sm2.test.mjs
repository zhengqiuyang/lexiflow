import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule } from "../src/sm2.mjs";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

test("新卡:记得 → rep1 间隔 1 天", () => {
  const c = schedule({ ease: 2.5, interval: 0, reps: 0, lapses: 0 }, 5, NOW);
  assert.equal(c.reps, 1);
  assert.equal(c.interval, 1);
  assert.equal(c.dueMs, NOW + DAY);
});

test("第二次记得 → 间隔 6 天", () => {
  const c = schedule({ ease: 2.5, interval: 1, reps: 1, lapses: 0 }, 4, NOW);
  assert.equal(c.interval, 6);
});

test("后续按 ease 增长", () => {
  const c = schedule({ ease: 2.5, interval: 6, reps: 2, lapses: 0 }, 5, NOW);
  assert.equal(c.interval, Math.round(6 * 2.6));
});

test("忘记 → 重置,lapse+1,ease 下降", () => {
  const c = schedule({ ease: 2.5, interval: 30, reps: 4, lapses: 0 }, 2, NOW);
  assert.equal(c.reps, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.interval, 0);
  assert.equal(c.ease, 2.3);
  assert.equal(c.dueMs, NOW);   // 今天内再见
});

test("模糊(q=3)通过但 ease 下降,间隔翻倍", () => {
  const c = schedule({ ease: 2.5, interval: 6, reps: 2, lapses: 0 }, 3, NOW);
  assert.equal(c.ease, 2.36);
  assert.equal(c.interval, Math.round(6 * 2.36));
});

test("ease 下限 1.3", () => {
  let c = { ease: 1.3, interval: 6, reps: 2, lapses: 3 };
  c = schedule(c, 2, NOW);
  c = schedule(c, 2, NOW + DAY);
  assert.equal(c.ease, 1.3);
});

test("纯函数:不修改入参", () => {
  const input = Object.freeze({ ease: 2.5, interval: 0, reps: 0, lapses: 0 });
  schedule(input, 5, NOW);
  assert.equal(input.reps, 0);
});
