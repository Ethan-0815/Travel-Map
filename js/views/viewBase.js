// views/viewBase.js — 视图基类
export class ViewBase {
  constructor(app) {
    this.app = app; // 全局上下文 { router, state, ... }
    this.el = null;
    this.mounted = false;
  }

  /** 创建并返回根 DOM（子类实现） */
  render() {
    return document.createElement('div');
  }

  mount(container, { activate = true } = {}) {
    this.el = this.render();
    this.el.classList.add('view');
    container.appendChild(this.el);
    this.mounted = true;
    // activate=false 时由路由控制激活（Tab 视图常驻）
    if (activate) requestAnimationFrame(() => this.el.classList.add('is-active'));
    this.onMount();
  }

  /** 页面可见时调用 */
  onShow() {}

  onMount() {}

  /** 页面隐藏时调用 */
  onHide() {}

  unmount() {
    this.onHide();
    this.el.classList.remove('is-active');
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.mounted = false;
  }

  /** 便捷：获取全局仓库 */
  get repo() {
    return this.app.repo;
  }
  get t() {
    return this.app.t;
  }
  get i18n() {
    return this.app.i18n;
  }
}
