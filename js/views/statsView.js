// views/statsView.js — 视图③：Stats（Travel Profile / Archive）
// 区块：核心数据 / 旅行热度 / 洞察 / 精彩瞬间 / 时间线 / 足迹
import { ViewBase } from './viewBase.js';
import { el, clear } from '../utils/dom.js';
import { tween, EASE_OUT } from '../core/tween.js';
import { fmtNumber, yearOf, monthName, fmtShort, fmtDate } from '../utils/date.js';
import { distanceBetween } from '../data/repo.js';
import { buildFootprintMap } from './footprintMap.js';
import { on } from '../core/eventbus.js';
import { collectCityVisits, cityLabel } from '../utils/cityVisits.js';
import { CityDetail } from './cityDetail.js';
import { yearPicker } from './yearPicker.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class StatsView extends ViewBase {
  render() {
    this.root = el('div', { class: 'stats-page' });
    this.head = el('div', { class: 'page-head' });
    this.head.appendChild(el('div', { class: 'sub', style: { textTransform: 'uppercase', letterSpacing: '0.14em' } }, this.t('stats.title')));
    this.scroll = el('div', { class: 'view-scroll' });
    this.root.appendChild(this.head);
    this.root.appendChild(this.scroll);
    this.cityDetail = new CityDetail(this.app, this.root, this.scroll);
    this._unsub = on('data:changed', () => this._render());
    return this.root;
  }

  onMount() {
    this._render();
  }

  onShow() {
    this._render();
  }

  onHide() {
    this.cityDetail.hide();
  }

  unmount() {
    this._unsub();
    this._yearPicker?.dispose();
    this.cityDetail.destroy();
    super.unmount();
  }

  _render() {
    this._yearPicker?.dispose();
    const repo = this.app.repo;
    const years = [...new Set(repo.state.journeys.map(j => yearOf(j.startDate)).filter(Boolean))].sort((a, b) => b - a);
    if (!years.includes(this._year)) this._year = null;
    const journeys = repo.state.journeys.filter(j => !this._year || yearOf(j.startDate) === this._year);
    const places = journeys.flatMap(j => repo.placesByJourney(j.id));
    const uniquePlaces = this._year
      ? [...new Map(places.map(p => [`${p.name}|${p.lat}|${p.lng}`, p])).values()]
      : repo.uniquePlaces();
    const s = this._year ? {
      cities: uniquePlaces.length,
      countries: new Set(uniquePlaces.map(p => p.country).filter(Boolean)).size,
      journeys: journeys.length,
      distance: Math.round(journeys.reduce((sum, j) => {
        const route = repo.placesByJourney(j.id);
        return sum + route.slice(1).reduce((km, place, i) => km + distanceBetween(route[i], place), 0);
      }, 0)),
    } : repo.stats();
    const locale = this.app.i18n.getLang();
    clear(this.scroll);
    this.head.firstChild.textContent = this.t('stats.title');
    if (years.length) {
      const select = el('select', {
        class: 'stats-year-select', 'aria-label': this.t('stats.year'),
        onchange: event => { this._year = Number(event.target.value) || null; this._render(); this.scroll.querySelector('.stats-year-trigger')?.focus({ preventScroll: true }); },
      }, [el('option', { value: '' }, this.t('stats.all')), ...years.map(y => el('option', { value: y }, String(y)))]);
      select.value = this._year || '';
      this._yearPicker = yearPicker(select, this.t('stats.year'));
      this.scroll.appendChild(el('div', { class: 'stats-filter' }, [
        el('span', {}, this.t('stats.year')), this._yearPicker.root,
      ]));
    }

    // ===== 区块 1：核心数据 =====
    const overview = el('div', { class: 'stats-overview' });
    const grid = el('div', { class: 'stats-grid' });
    const cards = [
      { num: s.cities, label: this.t('stats.cities') },
      { num: s.countries, label: this.t('stats.countries') },
      { num: s.journeys, label: this.t('stats.journeys') },
      { num: s.distance, label: this.t('stats.distance'), format: true, suffix: ' ' + this.t('common.km') },
    ];
    this._targets = [];
    for (const c of cards) {
      const numEl = el('div', { class: 'num' }, '0');
      const value = el('div', { class: 'stat-value' }, [numEl]);
      if (c.suffix) value.appendChild(el('span', { class: 'stat-unit' }, c.suffix.trim()));
      const card = el('div', { class: 'stat-card' }, [value, el('div', { class: 'label' }, c.label)]);
      grid.appendChild(card);
      this._targets.push({ el: numEl, to: c.num, format: !!c.format, suffix: c.suffix || '', locale });
    }
    overview.appendChild(grid);
    const cities = collectCityVisits(repo, journeys).sort((a, b) =>
      cityLabel(a, locale).name.localeCompare(cityLabel(b, locale).name, locale === 'zh' ? 'zh-CN' : 'en')).slice(0, 4);
    const cityList = el('ul', { class: 'stats-city-list', 'aria-label': this.t('city.list') });
    for (const city of cities) {
      const label = cityLabel(city, locale);
      const button = el('button', {
        type: 'button', class: 'stats-city-row', 'data-city-key': city.key, title: [label.name, label.country].filter(Boolean).join(' · '),
        onclick: event => this.cityDetail.open(city.key, event.currentTarget),
      }, [
        el('span', { class: 'city-row-body' }, [
          el('span', { class: 'city-row-name' }, label.name),
          el('span', { class: 'city-row-meta' }, label.country || this.t('city.countryUnknown')),
        ]),
        el('span', { class: 'city-row-arrow', 'aria-hidden': 'true' }, '›'),
      ]);
      cityList.appendChild(el('li', {}, [button]));
    }
    if (cities.length) {
      overview.appendChild(cityList);
    }
    this.scroll.appendChild(overview);

    // Count-up
    for (const tg of this._targets) {
      tween({
        from: { v: 0 },
        to: { v: tg.to },
        duration: 900,
        ease: EASE_OUT,
        onUpdate: (o) => {
          const val = Math.round(o.v);
          tg.el.textContent = tg.format ? fmtNumber(val, tg.locale) : String(val);
        },
      });
    }

    const hasData = journeys.length > 0;

    // ===== 区块 2：年度旅行热度 =====
    const heat = this._buildHeat(journeys, repo, locale);
    if (heat) {
      this.scroll.appendChild(this._section('stats.heat'));
      this.scroll.appendChild(heat);
    }

    if (hasData) {
      this.scroll.appendChild(this._section('stats.insights'));
      this.scroll.appendChild(el('div', { class: 'stats-insights' }, this._buildInsights(journeys, repo, locale)));
    }

    // ===== 区块 4：Travel Highlights =====
    const highlights = this._buildHighlights(journeys, repo, locale);
    if (highlights.length) {
      this.scroll.appendChild(this._section('stats.highlights'));
      this.scroll.appendChild(el('div', { class: 'highlights' }, highlights));
    }

    // ===== 区块 5：Travel Timeline =====
    if (hasData) {
      this.scroll.appendChild(this._section('stats.timeline'));
      this.scroll.appendChild(this._buildTimeline(journeys, repo, locale));
    }

    // ===== 区块 6：Travel Footprint（足迹地图） =====
    if (hasData) {
      this.scroll.appendChild(this._section('stats.footprint'));
      const wrap = el('div', { class: 'footprint-wrap' });
      this.scroll.appendChild(wrap);
      // 异步渲染足迹地图（复用底图数据，有缓存）
      const w = wrap.clientWidth || 320;
      buildFootprintMap({
        width: w,
        height: Math.round(w * 0.56),
        places: uniquePlaces,
        journeys,
        placesByJourney: (id) => repo.placesByJourney(id),
      }).then((svg) => {
        if (!wrap.isConnected) return;
        clear(wrap);
        wrap.appendChild(svg);
      });

    }

    // 无数据空状态
    if (!hasData) {
      this.scroll.appendChild(
        el('div', { class: 'empty' }, [
          el('div', { class: 'icon' }, '◌'),
          el('div', { text: this.t('journeys.empty') }),
          el('div', { text: this.t('journeys.emptyHint') }),
        ])
      );
    }
  }

  _section(key) {
    return el('div', { class: 'stats-section' }, [el('span', { text: this.t(key) })]);
  }

  // ---- 时间线：年份 → 月份 → 旅程（A → B → C） ----
  _buildTimeline(journeys, repo, locale) {
    const wrap = el('div', { class: 'stats-timeline' });
    const sorted = [...journeys].sort((a, b) => ((a.startDate || '') < (b.startDate || '') ? 1 : -1));

    let curYear = null;
    let curMonth = null;
    for (const j of sorted) {
      const date = (j.startDate || '').slice(0, 10);
      if (!date) continue;
      const y = yearOf(date);
      const m = monthName(date, locale);
      const monthKey = `${y}-${m}`;
      if (y !== curYear) {
        curYear = y;
        curMonth = null;
        wrap.appendChild(el('div', { class: 'stl-year' }, String(y)));
      }
      if (monthKey !== curMonth) {
        curMonth = monthKey;
        wrap.appendChild(el('div', { class: 'stl-month' }, m));
      }
      const ps = repo.placesByJourney(j.id);
      const routeStr = ps.length ? ps.map((p) => p.name).join(' → ') : j.title;
      const item = el('div', { class: 'stl-item', onclick: () => this._goMap() }, [
        el('span', { class: 'stl-dot' }),
        el('div', { class: 'stl-body' }, [
          el('div', { class: 'stl-route' }, routeStr),
          j.title && j.title !== routeStr ? el('div', { class: 'stl-title' }, j.title) : null,
        ]),
        el('span', { class: 'stl-date' }, fmtShort(date, locale)),
      ]);
      wrap.appendChild(item);
    }
    return wrap;
  }

  _goMap() {
    this.app.router.go('map');
  }

  // ---- Highlights：从真实数据计算 ----
  _buildInsights(journeys, repo, locale) {
    const out = [];

    // 最长旅程（总距离）
    let longest = null;
    let longestKm = 0;
    for (const j of journeys) {
      const ps = repo.placesByJourney(j.id);
      let d = 0;
      for (let i = 1; i < ps.length; i++) d += distanceBetween(ps[i - 1], ps[i]);
      if (d > longestKm) {
        longestKm = d;
        longest = j;
      }
    }
    if (longest && longestKm > 0) {
      out.push(
        this._highlight(
          this.t('stats.highlightLongest'),
          (longest.title || '').trim() || repo.placesByJourney(longest.id).map((p) => p.name).join(' → '),
          this.t('stats.totalDistance') + ' · ' + fmtNumber(Math.round(longestKm), locale) + ' ' + this.t('common.km')
        )
      );
    }

    // 单段最长航段（最远的两城市）
    let farA = null;
    let farB = null;
    let farKm = 0;
    for (const j of journeys) {
      const ps = repo.placesByJourney(j.id);
      for (let i = 1; i < ps.length; i++) {
        const d = distanceBetween(ps[i - 1], ps[i]);
        if (d > farKm) {
          farKm = d;
          farA = ps[i - 1];
          farB = ps[i];
        }
      }
    }
    if (farA && farB && farKm > 0) {
      out.push(
        this._highlight(
          this.t('stats.highlightFarthest'),
          `${farA.name} → ${farB.name}`,
          this.t('stats.longestLeg') + ' · ' + fmtNumber(Math.round(farKm), locale) + ' ' + this.t('common.km')
        )
      );
    }

    const latest = [...journeys].filter(j => yearOf(j.startDate)).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    if (latest) out.push(this._highlight(this.t('stats.latest'), latest.title || repo.placesByJourney(latest.id).map(p => p.name).join(' → '), fmtDate(latest.startDate, locale)));
    // 同一次旅程重复经过同一城市只计一次，与现有城市去重口径一致。
    const visits = new Map();
    for (const j of journeys) {
      const cities = new Map(repo.placesByJourney(j.id).map(p => [`${p.name}|${p.lat}|${p.lng}`, p.name]));
      for (const [key, name] of cities) visits.set(key, { name, n: (visits.get(key)?.n || 0) + 1 });
    }
    const top = [...visits.values()].sort((a, b) => b.n - a.n)[0];
    if (top) out.push(this._highlight(this.t('stats.topCity'), top.name, fmtNumber(top.n, locale) + ' ' + this.t('stats.visitJourneys')));
    return out;
  }

  _buildHighlights(journeys, repo, locale) {
    const out = [];
    // 旅行最多的国家
    const countryCount = new Map();
    for (const p of journeys.flatMap(j => repo.placesByJourney(j.id))) {
      if (!p.country) continue;
      countryCount.set(p.country, (countryCount.get(p.country) || 0) + 1);
    }
    let topCountry = null;
    let topCountryN = 0;
    for (const [c, n] of countryCount) {
      if (n > topCountryN) {
        topCountryN = n;
        topCountry = c;
      }
    }
    if (topCountry) {
      out.push(this._highlight(this.t('stats.highlightCountry'), topCountry, fmtNumber(topCountryN, locale) + ' ' + this.t('stats.visits')));
    }

    // 访问城市最多的年份
    const yearPlaces = new Map();
    for (const j of journeys) {
      const y = yearOf(j.startDate);
      if (!y) continue;
      const ps = repo.placesByJourney(j.id);
      yearPlaces.set(y, (yearPlaces.get(y) || 0) + ps.length);
    }
    let topYear = null;
    let topYearN = 0;
    for (const [y, n] of yearPlaces) {
      if (n > topYearN) {
        topYearN = n;
        topYear = y;
      }
    }
    if (topYear) {
      out.push(this._highlight(this.t('stats.highlightYear'), String(topYear), fmtNumber(topYearN, locale) + ' ' + this.t('stats.visits')));
    }

    return out;
  }

  _highlight(label, value, sub) {
    return el('div', { class: 'highlight' }, [
      el('div', { class: 'h-label' }, label),
      el('div', { class: 'h-value' }, value),
      el('div', { class: 'h-sub' }, sub),
    ]);
  }

  // ---- 年度热度：12 个月到访城市数映射强度 ----
  _buildHeat(journeys, repo, locale) {
    const counts = new Array(12).fill(0);
    for (const j of journeys) {
      const ps = repo.placesByJourney(j.id);
      // 用旅程内每个地点的到达时间或旅程开始时间落月
      for (const p of ps) {
        const d = (p.arriveAt || j.startDate || '').slice(0, 10);
        if (!d) continue;
        const m = new Date(d.length === 10 ? d + 'T00:00:00' : d).getMonth();
        if (isNaN(m)) continue;
        counts[m]++;
      }
    }
    if (!journeys.length) return null;

    const max = Math.max(...counts);
    const wrap = el('div', { class: 'heat-grid' });
    for (let m = 0; m < 12; m++) {
      const n = counts[m];
      // 强度 0~4 档
      const level = n > 0 ? Math.max(1, Math.ceil((n / max) * 4)) : 0;
      const month = locale === 'zh' ? `${m + 1}月` : MONTHS[m];
      const description = `${month} · ${n} ${this.t('stats.visits')}`;
      const cell = el('div', { class: 'heat-cell', 'data-level': level, title: description, 'aria-label': description }, [
        el('span', { class: 'heat-month' }, month),
        el('span', { class: 'heat-dot' }),
      ]);
      wrap.appendChild(cell);
    }
    return wrap;
  }
}
