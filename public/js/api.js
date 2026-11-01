/** API 调用助手:5s 超时 + 自动重试一次(防本地 keep-alive 死连接挂起) */
async function fetchOnce(path, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(path, {
      method: opts.method ?? "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function api(path, opts = {}) {
  let res;
  try {
    res = await fetchOnce(path, opts, 5000);
  } catch (e) {
    res = await fetchOnce(path, opts, 8000);   // 重试一次(可能换新连接)
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** 浏览器 TTS 朗读英文 */
export function speak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.92;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
    if (voices.length) u.voice = voices.find(v => /en[-_]US/i.test(v.lang)) ?? voices[0];
    speechSynthesis.speak(u);
  } catch { /* 无 TTS 环境 */ }
}
