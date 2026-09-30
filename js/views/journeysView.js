// views/journeysView.js — 视图②：Journeys 时间线
import { ViewBase } from './viewBase.js';
import { icon, el, clear } from '../utils/dom.js';
import { yearOf, monthName, fmtShort } from '../utils/date.js';
import { on } from '../core/eventbus.js';

export class JourneysView extends ViewBase {
  render() {
    this.root = el('div', {});
    this.head = el('div', { class: 'page-head page-head-row' });
    this.head.appendChild(el('div', {}, [el('div', { class: 'display', text: 'JOURNEYS' })]));
    this.replayBtn = el('button', { class: 'btn btn-sm btn-accent', onclick: () => this._openReplay() }, [icon('play', 14), el('span', { text: 'Replay' })]);
    this.head.appendChild(this.replayBtn);

    this.scroll = el('div', { class: 'view-scroll' });

    this.root.appendChild(this.head);
    this.root.appendChild(this.scroll);
    this._unsub = on('data:changed', () => this._render());
    return this.root;
  }

  onMount() {
    this._render();
  }

  onShow() {
    this._render();
  }

  unmount() {
    this._unsub();
    this._lineObserver?.disconnect();
    super.unmount();
  }

  _openReplay() {
    // 切到地图并打开重放面板
    this.app.replayRequested = true;
    this.app.router.go('map');
  }

  _render() {
    this._lineObserver?.disconnect();
    const repo = this.app.repo;
    const locale = this.app.i18n.getLang();
    clear(this.scroll);

    // 收集所有到访（含旅程起点的地点），按时间排序
    const visits = repo.state.places
      .map((p) => {
        const j = repo.state.journeys.find((x) => x.id === p.journeyId);
        const date = (p.arriveAt || (j && j.startDate) || '').slice(0, 10);
        return { place: p, journey: j, date };
      })
      .filter((v) => v.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    if (!visits.length) {
      this.scroll.appendChild(
        el('div', { class: 'empty' }, [
          el('div', { class: 'icon' }, '◌'),
          el('div', { text: this.t('journeys.empty') }),
          el('div', { text: this.t('journeys.emptyHint') }),
        ])
      );
      return;
    }

    const tl = el('div', { class: 'timeline' });
    tl.appendChild(el('div', { class: 'tl-line' }));

    let curYear = null;
    let curMonth = null;

    for (const v of visits) {
      const y = yearOf(v.date);
      const m = monthName(v.date, locale);
      const monthKey = `${y}-${m}`;

      if (y !== curYear) {
        curYear = y;
        curMonth = null;
        tl.appendChild(el('div', { class: 'tl-year' }, [el('span', { class: 'y' }, String(y))]));
      }
      if (monthKey !== curMonth) {
        curMonth = monthKey;
        tl.appendChild(el('div', { class: 'tl-month' }, m));
      }

      const item = el('div', { class: 'tl-item', onclick: () => this._focusPlace(v) }, [
        el('span', { class: 'tl-dot' }),
        el('span', { class: 'tl-name' }, v.place.name),
        el('span', { class: 'tl-date' }, fmtShort(v.date, locale)),
      ]);
      tl.appendChild(item);
    }

    this.scroll.appendChild(tl);
    // The axis ends at the actual first/last markers, including wrapped names.
    const fitLine = () => {
      const first = tl.querySelector('.tl-year');
      const last = tl.querySelector('.tl-item:last-child');
      if (!first || !last) return;
      const top = first.offsetTop + first.offsetHeight / 2;
      const bottom = last.offsetTop + last.offsetHeight / 2;
      const line = tl.querySelector('.tl-line');
      line.style.top = `${top}px`;
      line.style.height = `${Math.max(0, bottom - top)}px`;
      line.style.visibility = 'visible';
    };
    this._lineObserver = new ResizeObserver(fitLine);
    this._lineObserver.observe(tl);
  }

  _focusPlace(v) {
    // 跳转地图并聚焦该地点
    this.app.router.go('map', { focusKey: String(v.place.name).toLowerCase() });
  }
}
