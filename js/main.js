// main.js — 应用入口
import * as repo from './data/repo.js';
import * as i18n from './i18n/index.js';
import { Router } from './router.js';
import { el, icon } from './utils/dom.js';
import { emit } from './core/eventbus.js';
import { initThemeColor } from './core/themeColor.js';

initThemeColor();

const app = {
  repo,
  i18n,
  t: i18n.t,
  router: null,
  focusKey: null,
  replayRequested: false,
  pendingNewJourney: null,

  getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  },
  async setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    await repo.setSetting('theme', theme);
  },
  async setLang(lang) {
    i18n.setLang(lang);
    await repo.setSetting('lang', lang);
  },

  toastEl: null,
  toastTimer: null,
  toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('is-show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('is-show'), 2200);
  },
};

// ---- 构建外壳 ----
function buildShell() {
  const root = document.getElementById('app');
  root.innerHTML = '';

  const viewsEl = el('div', { id: 'views' });
  const overlayEl = el('div', { id: 'overlay' });

  // 底部 Tab
  const tabbar = el('nav', { class: 'tabbar' });
  tabbar.appendChild(el('div', { class: 'tabbar-pill' }));
  const tabs = [
    { key: 'map', label: 'nav.map', ic: 'map' },
    { key: 'journeys', label: 'nav.journeys', ic: 'journeys' },
    { key: 'stats', label: 'nav.stats', ic: 'stats' },
  ];
  for (const t of tabs) {
    const btn = el('button', { class: 'tabbar-item', 'data-tab': t.key });
    btn.appendChild(icon(t.ic, 22));
    const span = el('span', { 'data-i18n': t.label });
    btn.appendChild(span);
    tabbar.appendChild(btn);
  }

  const toast = el('div', { class: 'toast' });

  root.appendChild(viewsEl);
  root.appendChild(overlayEl);
  root.appendChild(tabbar);
  root.appendChild(toast);

  app.toastEl = toast;
  return { viewsEl, overlayEl, tabbar };
}

// ---- 启动 ----
async function bootstrap() {
  const { viewsEl, overlayEl, tabbar } = buildShell();

  // 主题
  let theme = await repo.getSetting('theme', null);
  if (!theme) {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);

  // 语言
  let lang = await repo.getSetting('lang', null);
  if (!lang) {
    lang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  i18n.setLang(lang);

  // 数据
  await repo.loadAll();
  // 一次性清理旧 Demo 旅程：地图地点只能来自用户真实创建的 Journey，
  // 旧的自动注入 Demo（East Asia · 2019 / Europe · 2021）不再属于正式内容。
  const purged = await repo.getSetting('demoPurged', false);
  if (!purged) {
    const demoTitles = ['East Asia · 2019', 'Europe · 2021'];
    for (const j of repo.state.journeys.filter((x) => demoTitles.includes(x.title))) {
      await repo.deleteJourney(j.id);
    }
    await repo.setSetting('demoPurged', true);
  }

  // 路由
  app.router = new Router(app);
  app.router.init(viewsEl, overlayEl, tabbar);
  const { name, params } = app.router._parse(location.hash);
  app.router.navigate(name, params, { updateHash: false });

  // i18n 应用到外壳
  i18n.applyI18n(document.body);
  emit('lang:changed');

  // Service Worker（PWA，可选）
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

bootstrap().catch((e) => {
  console.error('bootstrap failed', e);
});
