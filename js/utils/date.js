// utils/date.js — 日期解析与格式化
export function parseDate(str) {
  if (!str) return null;
  const d = new Date(str.length === 10 ? str + 'T00:00:00' : str);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(str, locale = 'en') {
  const d = parseDate(str);
  if (!d) return '';
  const opts = { year: 'numeric', month: 'short', day: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', opts).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function fmtShort(str, locale = 'en') {
  const d = parseDate(str);
  if (!d) return '';
  const opts = { month: 'short', day: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', opts).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function yearOf(str) {
  const d = parseDate(str);
  return d ? d.getFullYear() : null;
}

export function monthName(str, locale = 'en') {
  const d = parseDate(str);
  if (!d) return '';
  const opts = { month: 'long' };
  try {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', opts).format(d);
  } catch {
    return '';
  }
}

export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fmtNumber(n, locale = 'en') {
  try {
    return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(n);
  } catch {
    return String(n);
  }
}
