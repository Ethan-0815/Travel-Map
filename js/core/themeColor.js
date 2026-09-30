// Appearance-only preference; intentionally independent of journey storage.
export const THEME_COLORS = ['blue', 'red', 'yellow', 'green', 'orange'];
const KEY = 'travel-map.theme-color';
const normalize = color => THEME_COLORS.includes(color) ? color : 'orange';
export function getThemeColor() {
  return normalize(document.documentElement.dataset.accent);
}
export function setThemeColor(color) {
  const selected = normalize(color);
  document.documentElement.dataset.accent = selected;
  try { localStorage.setItem(KEY, selected); } catch { /* Still apply this session when storage is unavailable. */ }
}
export function initThemeColor() {
  let saved = 'orange';
  try { saved = localStorage.getItem(KEY); } catch {}
  document.documentElement.dataset.accent = normalize(saved);
}
