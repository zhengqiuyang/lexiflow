/** 内联 SVG 线性图标(替代 emoji,商用级视觉)。icon(name, size) 返回 svg 字符串。 */

const P = {
  read: '<path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2.5 2.5 0 0 1 2 1v13a2 2 0 0 0-2-1H4.5A1.5 1.5 0 0 1 3 15.5z"/><path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H14a2.5 2.5 0 0 0-2 1v13a2 2 0 0 1 2-1h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  review: '<rect x="3" y="7" width="13" height="13" rx="2"/><path d="M8 3h10a3 3 0 0 1 3 3v10"/>',
  books: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="13" y="4" width="7" height="16" rx="1.5"/><path d="M3 9h7M13 9h7"/>',
  chat: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  speaker: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  flame: '<path d="M12 3s5.5 4.6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 8.5 9 6.5 9.5 4.5c1 1 1.6 2 1.7 3.2C12.2 6.5 12 4.5 12 3z"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  zap: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export function icon(name, size = 18) {
  const d = P[name] ?? P.doc;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
