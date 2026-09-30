// views/mapPage.js — 视图①：Map 首页
import { ViewBase } from './viewBase.js';
import { MapView } from '../map/mapView.js';
import { icon, el, clear } from '../utils/dom.js';
import { fmtShort, fmtDate, yearOf } from '../utils/date.js';
import { emit, on } from '../core/eventbus.js';
import { tween, EASE_OUT } from '../core/tween.js';
import { replayController } from '../replay/replayController.js';

export class MapPage extends ViewBase {
  render() {
    this.root = el('div', { class: 'map-root' });
    // 地图舞台（独立容器，避免 mapView 重建时清掉覆盖层）
    this.mapStage = el('div', { class: 'map-stage' });
    this.mapStage.style.opacity = 0; // 由进入动画淡入
    this.root.appendChild(this.mapStage);
    this.mapView = new MapView(this.mapStage);

    // 标题栏
    this.titlebar = el('div', { class: 'map-titlebar' });
    const brand = el(
      'div',
      { class: 'brand' },
      [document.createTextNode('TRAVEL'), el('span', { class: 'dot' }, ' ·'), document.createTextNode(' MAP')]
    );
    const right = el('div', { style: { display: 'flex', gap: '8px' } });
    this.replayBtn = el('button', { class: 'icon-btn', title: 'Replay', onclick: () => this._openReplay() }, [icon('play', 16)]);
    const settingsBtn = el('button', { class: 'icon-btn', title: 'Settings', onclick: () => this.app.router.go('settings') }, [icon('settings', 16)]);
    right.appendChild(this.replayBtn);
    right.appendChild(settingsBtn);
    this.titlebar.appendChild(brand);
    this.titlebar.appendChild(right);

    // 统计卡片（左下）
    this.statsCard = el('div', { class: 'map-stats' });
    this.statsCities = el('div', { class: 'num' }, '0');
    this.statsCountries = el('div', { class: 'num' }, '0');
    this.statsCard.appendChild(
      el('div', { class: 'stat' }, [this.statsCities, el('div', { class: 'k', 'data-i18n': 'map.cities' })])
    );
    this.statsCard.appendChild(
      el('div', { class: 'stat' }, [this.statsCountries, el('div', { class: 'k', 'data-i18n': 'map.countries' })])
    );

    // 回到世界视角
    this.homeBtn = el('button', { class: 'icon-btn map-home-btn', title: 'Back to world', onclick: () => this._resetView() }, [icon('locate', 16)]);

    // 「＋ 添加旅程」一级入口（右下角悬浮）
    this.addBtn = el('button', { class: 'map-add-btn', onclick: () => this.app.router.go('journeyForm', {}) }, [
      icon('plus', 16),
      el('span', { 'data-i18n': 'map.addJourney' }),
    ]);

    // 空状态（无旅行数据时提示）
    this.emptyState = el('div', { class: 'map-empty' });
    this.emptyState.appendChild(el('div', { class: 'map-empty-title', 'data-i18n': 'map.empty' }));
    this.emptyState.appendChild(
      el('button', { class: 'btn btn-accent', onclick: () => this.app.router.go('journeyForm', {}) }, [icon('plus', 16), el('span', { 'data-i18n': 'map.addJourney' })])
    );
    this.emptyState.style.display = 'none';

    // 详情面板
    this.detail = el('aside', { class: 'detail-panel' });
    this.detail.style.display = 'none';

    this.root.appendChild(this.titlebar);
    this.root.appendChild(this.statsCard);
    this.root.appendChild(this.homeBtn);
    this.root.appendChild(this.addBtn);
    this.root.appendChild(this.emptyState);
    this.root.appendChild(this.detail);

    // 订阅
    this._unsubs = [
      on('data:changed', () => this._renderData()),
      on('lang:changed', () => this._refreshTexts()),
    ];

    return this.root;
  }

  async onMount() {
    this._mapReady = false;
    await this.mapView.init();
    this._mapReady = true;
    this.mapView.onNodeClick = (key) => this._onNodeClick(key);
    this.mapView.onMapClick = () => this._onMapClick();
    this._renderData();
    this._updateEmptyState();
    // Register before entry playback starts.
    this._resizeHandler = () => this.mapView.resize();
    window.addEventListener('resize', this._resizeHandler);
    if (this._pageHidden) {
      this.mapStage.style.opacity = 1;
      this.mapView.entered = true;
      this._resumePlayback = true;
      return;
    }
    // 进入动画：淡入 → 稳定 → 自动聚焦旅行区域 → 路线生长
    await this.mapView.enterAnimation({ focusPoints: this._focusPoints() });
    if (this._pageHidden) return;
    this._animateStats();
    this._refreshTexts();
    this._consumePending();

  }

  onShow() {
    this._pageHidden = false;
    if (!this._mapReady) return;
    this._renderData();
    this._updateEmptyState();
    // 新旅程保存后由庆祝动画负责聚焦，避免与自动聚焦并发冲突
    const resume = this._resumePlayback && !this.app.pendingNewJourney && !this.app.replayRequested;
    this._resumePlayback = false;
    if (resume) this._startReplay();
    if (!resume && !this.app.replayRequested && !this.app.pendingNewJourney && !this.mapView._growing) this._autoFocus();
    if (!this.mapView._growing) this._animateStats();
    this._refreshTexts();
    this._consumePending();
  }

  onHide() {
    this._pageHidden = true;
    this._resumePlayback = this.mapView._growing || replayController.running;
    this._stopReplay();
    this.mapView.cancelRoutePlayback();
    this.mapView._growing = false;
    this.mapStage.style.opacity = 1;
    this._closeDetail();
  }

  unmount() {
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this._unsubs.forEach((u) => u());
    this._stopReplay();
    super.unmount();
  }

  _consumePending() {
    if (this.app.focusKey) {
      const key = this.app.focusKey;
      this.app.focusKey = null;
      const node = this.mapView.nodes.get(key);
      if (node) this._showDetail(node.place);
    }
    if (this.app.replayRequested) {
      this.app.replayRequested = false;
      this._openReplay();
    }
    if (this.app.pendingNewJourney) {
      const id = this.app.pendingNewJourney;
      this.app.pendingNewJourney = null;
      this._celebrateNewJourney(id);
    }
  }

  /** 新旅程保存后：定位 → 起点显示 → 单条路线生长。 */
  async _celebrateNewJourney(id) {
    const repo = this.app.repo;
    const places = this.mapView._journeyPlaces(id);
    if (!places.length) return;
    const mv = this.mapView;
    mv.cancelRoutePlayback();
    const playbackEpoch = mv._playbackEpoch;
    mv.hideRoute(id); // 立即隐藏，避免定位期间闪现完整路线
    // 隐藏该旅程除起点外的节点+标签：终点在路线抵达前必须完全不存在
    for (const p of places.slice(1)) {
      const key = keyOf(p.name);
      mv._revealed.delete(key);
      const node = mv.nodes.get(key);
      if (!node) continue;
      node.g.style.visibility = 'hidden';
      node.g.style.opacity = 0;
      node.g.setAttribute('transform', node.g.dataset.base);
      if (node.label) {
        node.label.style.visibility = 'hidden';
        node.label.style.opacity = 0;
        node.label.removeAttribute('transform');
      }
    }
    mv._growing = true;
    try {
      await mv.fitTo(places.map((p) => [p.lng, p.lat]), { padding: 110 });
      if (playbackEpoch !== mv._playbackEpoch) return;
      // 起点保持可见；路线从起点向终点真实生长，抵达时终点节点+名称依次出现
      mv.revealNode(keyOf(places[0].name));
      await mv.animateRoute(id, { dim: false, reveal: true, stepDelay: 90 });
    } finally {
      if (playbackEpoch === mv._playbackEpoch) {
        mv._growing = false;
        mv._updateLabels(mv.camera.cam.k);
      }
    }
    if (playbackEpoch !== mv._playbackEpoch) return;
    this._animateStats();
    this.app.toast(this.t('toast.journeyAdded'));
  }

  _renderData() {
    if (!this._mapReady) return;
    const repo = this.app.repo;
    const journeys = repo.state.journeys;
    const places = repo.uniquePlaces();

    this.mapView.setPlaces(places);
    this.mapView.setJourneyPlaces(
      new Map(journeys.map((j) => [j.id, repo.placesByJourney(j.id)]))
    );
    this.mapView.setJourneysById(new Map(journeys.map((j) => [j.id, j])));
    this.mapView.setRoutes(journeys);
    // 已进入过：数据变更后路线直接显示（首次进入由生长动画负责）
    if (this.mapView.entered) this.mapView.resetRoutes();

    const s = repo.stats();
    this.statsCities.textContent = s.cities;
    this.statsCountries.textContent = s.countries;
    this._updateEmptyState();
  }

  /** 统计数字 Count-up（快速、有速度感、两数字错开） */
  _animateStats() {
    const s = this.app.repo.stats();
    if (!s.cities || this.mapView._growing) {
      this.statsCard.classList.remove('is-show');
      return;
    }
    this.statsCard.classList.add('is-show');
    // 先同步归零，避免闪现最终值
    this.statsCities.textContent = '0';
    this.statsCountries.textContent = '0';
    tween({
      from: { v: 0 },
      to: { v: s.cities },
      duration: 600,
      ease: EASE_OUT,
      onUpdate: (o) => (this.statsCities.textContent = Math.round(o.v)),
    });
    // 国家数字延迟 ~120ms 再滚动，错开
    tween({
      from: { v: 0 },
      to: { v: s.countries },
      duration: 600,
      delay: 120,
      ease: EASE_OUT,
      onUpdate: (o) => (this.statsCountries.textContent = Math.round(o.v)),
    });
  }

  _refreshTexts() {
    const i18n = this.app.i18n;
    i18n.applyI18n(this.root);
    this.homeBtn.title = this.t(this._focusToggle ? 'map.backToWorld' : 'map.focusRoutes');
    this.homeBtn.setAttribute('aria-label', this.homeBtn.title);
  }

  /** 计算所有有效旅行地点的经纬度（供自动聚焦） */
  _focusPoints() {
    return this.app.repo.state.places
      .filter((p) => p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng))
      .map((p) => [p.lng, p.lat]);
  }

  /** 自动聚焦到用户旅行区域（无数据则回世界视角） */
  _autoFocus() {
    const points = this._focusPoints();
    if (!points.length) return this.mapView.resetView({ duration: 600 });
    return this.mapView.focusOnPlaces(points);
  }

  /** 无旅行数据时显示空状态提示 */
  _updateEmptyState() {
    const hasPlaces = this.app.repo.state.places.length > 0;
    this.emptyState.style.display = hasPlaces ? 'none' : 'flex';
  }

  async _focusJourney(journeyId) {
    const places = this.mapView._journeyPlaces(journeyId);
    if (!places.length) return;
    await this.mapView.fitTo(places.map((p) => [p.lng, p.lat]), { padding: 90 });
    await this.mapView.animateRoute(journeyId);
  }

  _onNodeClick(key) {
    const node = this.mapView.nodes.get(key);
    if (!node) return;
    this._showDetail(node.place);
  }

  _onMapClick() {
    this._closeDetail();
  }

  async _showDetail(place) {
    const repo = this.app.repo;
    const name = place.name;
    // 聚合该城市在所有旅程中的记录
    const visits = repo.state.places
      .filter((p) => p.name.toLowerCase() === name.toLowerCase())
      .sort((a, b) => (a.arriveAt || '') < (b.arriveAt || '') ? 1 : -1);

    const first = visits.length ? visits[visits.length - 1].arriveAt : null;
    const journeyIds = new Set(visits.map((v) => v.journeyId));
    const photoIds = visits.flatMap((v) => v.photoIds || []);

    this.mapView.flyTo([place.lng, place.lat], { k: 5 });
    this.mapView.setFocusing(true);
    this.mapView.activateNode(keyOf(name));

    const locale = this.app.i18n.getLang();

    clear(this.detail);
    this.detail.appendChild(el('div', { class: 'grabber' }));
    const closeBtn = el('button', { class: 'icon-btn detail-close', onclick: () => this._closeDetail() }, [icon('close', 16)]);
    this.detail.appendChild(closeBtn);

    const inner = el('div', { class: 'detail-inner' });
    inner.appendChild(
      el('div', { class: 'detail-place' }, [
        document.createTextNode(name),
        el('span', { class: 'country' }, place.country || ''),
      ])
    );

    // 首次到访
    if (first) {
      inner.appendChild(
        el('div', { class: 'detail-first' }, [
          el('span', { class: 'k' }, this.t('detail.firstVisited')),
          el('span', { class: 'v' }, fmtDate(first.slice(0, 10), locale)),
        ])
      );
    }

    // 统计
    inner.appendChild(
      el('div', { class: 'detail-stats' }, [
        this._stat(visits.length, this.t('detail.visits')),
        this._stat(photoIds.length, this.t('detail.photos')),
        this._stat(journeyIds.size, this.t('nav.journeys')),
      ])
    );

    // 照片
    if (photoIds.length) {
      const grid = el('div', { class: 'detail-photos' });
      for (const id of photoIds.slice(0, 6)) {
        const img = el('img', { alt: '' });
        repo.getPhotoUrl(id).then((url) => {
          if (url) img.src = url;
        });
        grid.appendChild(img);
      }
      inner.appendChild(grid);
    }

    // 回忆
    const memories = visits.filter((v) => v.note).slice(0, 5);
    if (memories.length) {
      inner.appendChild(el('h4', { text: this.t('detail.recentMemories') }));
      const list = el('div', { class: 'detail-memories' });
      for (const m of memories) {
        list.appendChild(
          el('div', { class: 'memory-item' }, [
            el('span', { class: 'date' }, fmtShort((m.arriveAt || '').slice(0, 10), locale)),
            el('span', { class: 'note' }, m.note),
          ])
        );
      }
      inner.appendChild(list);
    }

    this.detail.appendChild(inner);
    this.detail.style.display = 'flex';
  }

  _stat(value, key) {
    return el('div', { class: 'detail-stat' }, [
      el('div', { class: 'v' }, String(value)),
      el('div', { class: 'k' }, key),
    ]);
  }

  _closeDetail() {
    this.detail.style.display = 'none';
    this.mapView.setFocusing(false);
    this.mapView.clearActive();
    this.mapView.resetRoutes();
  }

  async _resetView() {
    if (this._focusBusy) return;
    this._focusBusy = true;
    this._closeDetail();
    try {
      if (this._focusToggle) await this.mapView.resetView();
      else await this._autoFocus();
      this._focusToggle = !this._focusToggle;
      this._refreshTexts();
    } finally {
      this._focusBusy = false;
    }
  }

  // ---- Replay ----
  _openReplay() {
    if (!this._mapReady) {
      this.app.replayRequested = true;
      return;
    }
    this._startReplay();
  }

  _startReplay() {
    // The former default range covered every dated journey; keep that scope.
    const journeys = this.app.repo.state.journeys.filter(j => yearOf(j.startDate));
    if (!journeys.length) return;
    this._stopReplay();
    this._closeDetail();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const motion = this.mapStage.animate([
        { translate: '0 18px', opacity: 0.65 }, { translate: '0 0', opacity: 1 },
      ], { duration: 360, easing: 'cubic-bezier(.22,.68,.25,1)' });
      this._replayIntro = motion;
      motion.finished.then(() => {
        if (this._replayIntro === motion) this._replayIntro = null;
      }).catch(() => {});
    }
    replayController.start({
      mapView: this.mapView,
      journeys,
      repo: this.app.repo,
      t: this.t.bind(this),
    });
  }

  _stopReplay() {
    this.app.replayRequested = false;
    this._replayIntro?.cancel();
    this._replayIntro = null;
    replayController.stop();
  }
}

function keyOf(name) {
  return String(name || '').toLowerCase();
}
