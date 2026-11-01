/**
 * SM-2 间隔重复排期(纯函数)。
 * 质量 q:2=忘记 3=模糊 5=记得。q<3 重置进度;否则按 SM-2 增长间隔。
 */
export function schedule(card, q, nowMs = Date.now()) {
  const DAY = 86_400_000;
  const c = { ...card };
  c.reps = c.reps ?? 0;
  c.lapses = c.lapses ?? 0;
  c.ease = c.ease ?? 2.5;
  c.interval = c.interval ?? 0;

  if (q < 3) {
    c.reps = 0;
    c.lapses += 1;
    c.interval = 0;                 // 重新学习,今天内再见
    c.ease = Math.max(1.3, c.ease - 0.2);
  } else {
    c.ease = Math.max(1.3, c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    c.reps += 1;
    if (c.reps === 1) c.interval = 1;
    else if (c.reps === 2) c.interval = 6;
    else c.interval = Math.round(c.interval * c.ease);
  }
  c.lastMs = nowMs;
  c.dueMs = nowMs + c.interval * DAY;
  return c;
}
