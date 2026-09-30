// views/settingsView.js — 视图⑤：Settings
import { ViewBase } from './viewBase.js';
import { icon, el, clear } from '../utils/dom.js';
import * as backup from '../data/backup.js';
import { on } from '../core/eventbus.js';
import { THEME_COLORS, getThemeColor, setThemeColor } from '../core/themeColor.js';
import { DeleteJourneys } from './deleteJourneys.js';

export class SettingsView extends ViewBase {
  render() {
    this.root = el('div', {});
    this.head = el('div', { class: 'page-head page-head-row' });
    const back = el('button', { class: 'icon-btn', onclick: () => this._back() }, [icon('back', 16)]);
    this.head.appendChild(back);
    this.head.appendChild(el('div', { class: 'display', text: 'SETTINGS' }));
    this.head.appendChild(el('div', { style: { width: 38 } }));

    this.scroll = el('div', { class: 'view-scroll settings-list' });
    this.root.appendChild(this.head);
    this.root.appendChild(this.scroll);
    this._unsub = on('lang:changed', () => this._render());
    return this.root;
  }

  onMount() {
    this._render();
  }

  onShow() {
    this._render();
  }

  unmount() {
    this.deleteJourneys?.destroy();
    this._unsub();
    super.unmount();
  }

  _render() {
    clear(this.scroll);

    // 主题
    const themeOn = this.app.getTheme() === 'dark';
    const themeToggle = el('button', { class: 'toggle' + (themeOn ? ' is-on' : ''), onclick: () => this._toggleTheme() });
    this.scroll.appendChild(
      el('div', { class: 'setting-row' }, [
        el('div', {}, [el('div', { class: 's-label', text: this.t('settings.theme') }), el('div', { class: 's-desc', text: themeOn ? this.t('settings.themeDark') : this.t('settings.themeLight') })]),
        themeToggle,
      ])
    );

    // 本地主题色：只更新外观，不接触旅程数据库。
    const colors = el('div', { class: 'theme-colors', role: 'group', 'aria-label': this.t('settings.color') });
    for (const color of THEME_COLORS) {
      colors.appendChild(el('button', {
        class: 'theme-color',
        'data-accent': color,
        'aria-pressed': String(getThemeColor() === color),
        'aria-label': this.t(`settings.color.${color}`),
        onclick: () => {
          setThemeColor(color);
          for (const button of colors.children) button.setAttribute('aria-pressed', String(button.dataset.accent === color));
        },
      }, [el('span', { class: 'theme-color-dot', 'aria-hidden': 'true' }), el('span', {}, this.t(`settings.color.${color}`))]));
    }
    this.scroll.appendChild(el('div', { class: 'setting-row setting-colors' }, [
      el('div', { class: 's-label', text: this.t('settings.color') }), colors,
    ]));

    // 语言
    const langZh = this.app.i18n.getLang() === 'zh';
    const langToggle = el('button', { class: 'toggle' + (langZh ? ' is-on' : ''), role: 'switch', 'aria-checked': String(langZh), 'aria-label': '中文 / English', onclick: () => this._toggleLang() });
    this.scroll.appendChild(
      el('div', { class: 'setting-row' }, [
        el('div', {}, [el('div', { class: 's-label', text: this.t('settings.lang') }), el('div', { class: 's-desc' }, langZh ? '中文' : 'English')]),
        el('div', { class: 'language-control' }, [
          el('span', { class: langZh ? 'is-current' : '' }, '中文'),
          el('span', { 'aria-hidden': 'true' }, '/'),
          el('span', { class: !langZh ? 'is-current' : '' }, 'English'),
          langToggle,
        ]),
      ])
    );

    // 导出
    this.scroll.appendChild(
      el('div', { class: 'setting-row', onclick: () => this._export() }, [
        el('div', {}, [el('div', { class: 's-label', text: this.t('settings.export') }), el('div', { class: 's-desc', text: this.t('settings.exportDesc') })]),
        icon('download', 18),
      ])
    );

    // 导入
    this.scroll.appendChild(
      el('div', { class: 'setting-row', onclick: () => this._import() }, [
        el('div', {}, [el('div', { class: 's-label', text: this.t('settings.import') }), el('div', { class: 's-desc', text: this.t('settings.importDesc') })]),
        icon('upload', 18),
      ])
    );

    this.scroll.appendChild(el('h2', { class: 'settings-section-title' }, this.t('settings.travelFootprints')));
    if (this.app.repo.state.journeys.length) {
      const remove = el('button', { type: 'button', class: 'setting-row settings-delete-entry', onclick: () => {
        this.deleteJourneys ||= new DeleteJourneys(this.app, this.root, () => {
          const top = this.scroll.scrollTop;
          this._render();
          this.scroll.scrollTop = top;
          (this.scroll.querySelector('.settings-delete-entry') || this.head.querySelector('button')).focus({ preventScroll: true });
        });
        this.deleteJourneys.open(remove);
      } }, [el('div', {}, [
        el('div', { class: 's-label' }, this.t('settings.deleteTravel')),
        el('div', { class: 's-desc' }, this.t('settings.deleteTravelDesc')),
      ]), icon('trash', 18)]);
      this.scroll.appendChild(remove);
    } else {
      this.scroll.appendChild(el('div', { class: 'setting-row' }, [el('p', { class: 's-desc' }, this.t('settings.noTravel'))]));
    }

    // 关于
    this.scroll.appendChild(
      el('div', { class: 'setting-row' }, [
        el('div', {}, [el('div', { class: 's-label', text: this.t('settings.about') }), el('div', { class: 's-desc', text: this.t('settings.aboutDesc') })]),
        icon('globe', 18),
      ])
    );
  }

  _back() {
    return this.app.router.back();
  }

  _toggleTheme() {
    this.app.setTheme(this.app.getTheme() === 'dark' ? 'light' : 'dark');
    this._render();
  }

  _toggleLang() {
    this.app.setLang(this.app.i18n.getLang() === 'zh' ? 'en' : 'zh');
  }

  async _export() {
    const json = await backup.exportBackup();
    backup.downloadFile('travel-map-backup.json', json);
    this.app.toast(this.t('toast.exported'));
  }

  _import() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await backup.importBackup(text);
        this.app.toast(this.t('toast.imported'));
        this._render();
      } catch (e) {
        this.app.toast(this.t('toast.importError'));
      }
    };
    input.click();
  }
}
