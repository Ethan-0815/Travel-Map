// i18n/index.js — 轻量 i18n
import en from './en.js';
import zh from './zh.js';
import { emit } from '../core/eventbus.js';

const dicts = { en, zh };
let current = 'en';

export function setLang(lang) {
  current = dicts[lang] ? lang : 'en';
  applyI18n(document.body);
  emit('lang:changed', current);
}

export function getLang() {
  return current;
}

export function t(key, params) {
  let str = dicts[current][key] ?? dicts.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

/** 遍历 root 下的 data-i18n / data-i18n-attr 并赋值 */
export function applyI18n(root = document.body) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((node) => {
    const spec = node.dataset.i18nAttr; // e.g. "placeholder:form.namePh"
    const [attr, key] = spec.split(':');
    node.setAttribute(attr, t(key));
  });
}

export default { t, setLang, getLang, applyI18n };
