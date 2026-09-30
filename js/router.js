// router.js — hash 路由 + 视图管理（Tab 持久 + 覆盖层压栈）
import { MapPage } from './views/mapPage.js';
import { JourneysView } from './views/journeysView.js';
import { StatsView } from './views/statsView.js';
import { JourneyForm } from './views/journeyForm.js';
import { SettingsView } from './views/settingsView.js';

export class Router {
  constructor(app) {
    this.app = app;
    this.tabs = null; // 三个常驻 Tab 视图
    this.currentTab = 'map';
    this.overlay = null; // 当前覆盖视图实例
    this.current = { name: 'map', params: {} };
    this._programmaticHash = false;
  }

  init(viewsEl, overlayEl, tabbarEl) {
    this.viewsEl = viewsEl;
    this.overlayEl = overlayEl;
    this.tabbarEl = tabbarEl;

    // 三个 Tab 视图常驻（激活由路由控制）
    this.tabs = {
      map: new MapPage(this.app),
      journeys: new JourneysView(this.app),
      stats: new StatsView(this.app),
    };
    for (const v of Object.values(this.tabs)) v.mount(viewsEl, { activate: false });

    // Tab 切换
    this.tabbarEl.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => this.go(btn.dataset.tab));
    });

    window.addEventListener('hashchange', () => this._onHash());
  }

  _onHash() {
    // 忽略程序化改 hash 触发的 hashchange，避免重复导航
    if (this._programmaticHash) {
      this._programmaticHash = false;
      return;
    }
    const { name, params } = this._parse(location.hash);
    this.navigate(name, params, { updateHash: false });
  }

  _parse(hash) {
    const path = (hash || '').replace(/^#\/?/, '');
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return { name: 'map', params: {} };
    if (parts[0] === 'journey') {
      if (parts[1] === 'new') return { name: 'journeyForm', params: {} };
      if (parts[2] === 'edit') return { name: 'journeyForm', params: { id: parts[1] } };
      return { name: 'map', params: { journeyId: parts[1] } };
    }
    return { name: parts[0], params: {} };
  }

  go(name, params = {}) {
    this.navigate(name, params, { updateHash: true });
  }

  back() {
    if (this.overlay) {
      const closing = this._closeOverlay();
      if (location.hash) history.replaceState(null, '', '#/');
      return closing;
    }
    this.go('map');
  }

  navigate(name, params, { updateHash }) {
    const isTab = ['map', 'journeys', 'stats'].includes(name);

    // 更新 hash（用标志位抑制随后触发的 hashchange，避免重复导航）
    if (updateHash) {
      const hash = name === 'map' ? '#/' : `#/${name}${params.id ? '/' + params.id + '/edit' : ''}`;
      if (location.hash !== hash) {
        this._programmaticHash = true;
        location.hash = hash;
      }
    }

    this.current = { name, params };
    if (isTab) {
      // 关闭覆盖层
      this._switchTab(name, params);
      this._closeOverlay();
    } else {
      // 打开覆盖层
      this._openOverlay(name, params);
    }

  }

  _switchTab(name, params) {
    const prev = this.tabs[this.currentTab];
    if (prev && prev !== this.tabs[name]) {
      prev.onHide();
      prev.el.classList.remove('is-active');
    }
    // 确保其余 Tab 全部隐藏
    for (const [key, v] of Object.entries(this.tabs)) {
      if (key !== name) v.el.classList.remove('is-active');
    }
    this.currentTab = name;
    const view = this.tabs[name];
    view.el.classList.add('is-active');
    view.onShow();

    // 高亮 Tab + Liquid Glass pill 液体滑动
    const order = ['map', 'journeys', 'stats'];
    this.tabbarEl.style.setProperty('--active-index', String(Math.max(0, order.indexOf(name))));
    this.tabbarEl.querySelectorAll('[data-tab]').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.tab === name)
    );
  }

  _openOverlay(name, params) {
    this._finishOverlayExit?.();
    if (this.overlay) this.overlay.unmount();
    this.overlay = null;
    let view;
    if (name === 'journeyForm') view = new JourneyForm(this.app);
    else if (name === 'settings') view = new SettingsView(this.app);
    else return;
    view.mount(this.overlayEl);
    this.overlay = view;
    // 隐藏 Tab 栏
    this.tabbarEl.classList.add('is-overlay-hidden');
    this.tabbarEl.inert = true;
  }

  _closeOverlay() {
    if (this._overlayExit) return this._overlayExit;
    const view = this.overlay;
    if (!view) return Promise.resolve();
    // Keep the outgoing page mounted until its shared CSS animation ends.
    view.el.inert = true;
    view.el.classList.add('is-overlay-exiting');
    this.tabbarEl.classList.remove('is-overlay-hidden');
    this.tabbarEl.classList.add('is-page-returning');
    this.tabbarEl.inert = false;
    const animations = [view.el, this.tabbarEl].flatMap(el => el.getAnimations());
    let resolve;
    const closing = new Promise(done => { resolve = done; });
    this._overlayExit = closing;
    const finish = () => {
      if (this._overlayExit !== closing) return;
      animations.forEach(animation => animation.cancel());
      view.unmount();
      if (this.overlay === view) this.overlay = null;
      this.tabbarEl.classList.remove('is-page-returning');
      this._overlayExit = null;
      this._finishOverlayExit = null;
      resolve();
    };
    this._finishOverlayExit = finish;
    Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
    return closing;
  }
}
