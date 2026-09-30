// map/mapView.js — 地图编排：SVG、底图、相机、节点、路线、进入动画、交互
import { setupProjection } from './projection.js';
import { createCamera } from './camera.js';
import { loadMapData, renderBaseLayers, svgEl } from './layers.js';
import { greatCirclePaths } from './routes.js';
import { createNode, nodeEnter, labelEnter, nodePulse, nodeActivate } from './nodes.js';
import { motion, NODE, ROUTE } from '../config.js';
import { tween, EASE_OUT, sequence, sleep } from '../core/tween.js';

export class MapView {
  constructor(root) {
    this.root = root;
    this.width = root.clientWidth || window.innerWidth;
    this.height = root.clientHeight || window.innerHeight;

    this.nodes = new Map(); // key -> {g, core, halo, place, label}
    this.routes = new Map(); // journeyId -> {g, legs:[{line, glow, from, to}]}
    this.activeKey = null;
    this.onNodeClick = null;
    this.onMapClick = null;
    this.entered = false;
    this.focusing = false;
    this._revealed = new Set();
    this._growing = false;
    this._journeyWait = null;
    this._allJourneys = [];
    this._routeProgress = new Map();

    this._resizeHandler = null;
  }

  async init() {
    this.data = await loadMapData();
    this._build();
    this._bindZoom();
    return this;
  }

  _build() {
    this.root.innerHTML = '';
    this._setupProj();

    const svg = svgEl('svg', { class: 'map-svg' });
    this.svg = svg;

    // defs
    const defs = svgEl('defs');
    const grad = svgEl('linearGradient', {
      id: 'ocean-grad',
      x1: '0%',
      y1: '0%',
      x2: '100%',
      y2: '100%',
    });
    grad.appendChild(svgEl('stop', { offset: '0%' }, 'stop-color: var(--map-ocean-1);'));
    grad.appendChild(svgEl('stop', { offset: '100%' }, 'stop-color: var(--map-ocean-2);'));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // 全屏海洋背景（固定在视口，不随相机变换）
    const bg = svgEl('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: 'url(#ocean-grad)' });
    svg.appendChild(bg);

    // 世界组（相机 transform）
    const world = svgEl('g', { class: 'world' });
    renderBaseLayers(world, { data: this.data, path: this.path });
    svg.appendChild(world);

    // 路线组 / 节点组 / 标签组（都在世界组内，随相机变换）
    this.routesG = svgEl('g', { class: 'routes' });
    this.nodesG = svgEl('g', { class: 'nodes' });
    this.labelsG = svgEl('g', { class: 'labels' });
    world.appendChild(this.routesG);
    world.appendChild(this.nodesG);
    world.appendChild(this.labelsG);

    this.root.appendChild(svg);

    this._setupCamera();
    this._bindClick();
  }

  _setupProj() {
    const { proj, path, baseScale, baseTranslate, project } = setupProjection(
      this.width,
      this.height
    );
    this.proj = proj;
    this.path = path;
    this.baseScale = baseScale;
    this.baseTranslate = baseTranslate;
    this.project = project;
  }

  _setupCamera() {
    this.camera = createCamera({
      width: this.width,
      height: this.height,
      baseTranslate: this.baseTranslate,
      project: this.project,
      onChange: (cam) => this._applyCamera(cam),
    });
  }

  _applyCamera(cam) {
    if (!this.svg) return;
    const world = this.svg.querySelector('.world');
    if (world) world.setAttribute('transform', `translate(${cam.x},${cam.y}) scale(${cam.k})`);
    // 节点与标签反缩放，保持恒定屏幕尺寸
    const inv = 1 / cam.k;
    for (const node of this.nodes.values()) {
      if (node.inner) node.inner.setAttribute('transform', `scale(${inv})`);
      if (node.labelWrap) node.labelWrap.setAttribute('transform', `translate(${node.lp[0]},${node.lp[1]}) scale(${inv})`);
    }
    for (const route of this.routes.values()) {
      for (const leg of route.legs) this._paintLeg(leg, leg.progress);
    }
    this._positionHead();
    this._updateLabels(cam.k);
  }

  _bindZoom() {
    const svg = this.svg;
    const self = this;
    this.zoom = d3
      .zoom()
      .scaleExtent([1, 24])
      .filter((event) => {
        // 允许滚轮 / 捏合 / 拖拽；屏蔽双击默认（双击交给点击聚焦）
        return !event.button && event.type !== 'dblclick';
      })
      .on('start', () => svg.classList.add('is-panning'))
      .on('zoom', (e) => {
        const t = e.transform;
        self.camera.set(t.x, t.y, t.k);
      })
      .on('end', () => svg.classList.remove('is-panning'));

    d3.select(svg).call(this.zoom);
    // 同步 d3-zoom 初始状态到相机
    this._syncZoomTransform();
  }

  _bindClick() {
    // 用 pointer 位移区分「拖拽」与「点击」，拖拽不触发节点选择
    let downPos = null;
    this.svg.addEventListener('pointerdown', (e) => {
      downPos = [e.clientX, e.clientY];
    });
    this.svg.addEventListener('click', (e) => {
      const dx = downPos ? Math.abs(e.clientX - downPos[0]) : 0;
      const dy = downPos ? Math.abs(e.clientY - downPos[1]) : 0;
      downPos = null;
      if (dx > 4 || dy > 4) return; // 是拖拽
      // Continue to the next independent journey.
      if (this.continueJourney()) return;
      // An extra click during arrival/advance belongs to this playback,
      // not to the city-detail flow or another playback request.
      if (this._routePlayback) return;
      const nodeG = e.target.closest('.map-node');
      if (nodeG && this.onNodeClick) {
        this.onNodeClick(nodeG.dataset.key);
      } else if (!nodeG && this.onMapClick) {
        if (!this._activeDraw) this.onMapClick();
      }
    });
  }

  _syncZoomTransform() {
    // 把当前 camera 写回 d3-zoom，避免手势与程序动画打架
    d3.select(this.svg).call(this.zoom.transform, d3.zoomIdentity.translate(this.camera.cam.x, this.camera.cam.y).scale(this.camera.cam.k));
  }

  // ---- 节点 ----
  setPlaces(places) {
    // 清空旧节点/标签
    this.nodesG.innerHTML = '';
    this.labelsG.innerHTML = '';
    this.nodes.clear();

    for (const place of places) {
      const key = this._key(place);
      const p = this.project([place.lng, place.lat]);
      const node = createNode(p, { name: place.name });
      const { g } = node;
      g.dataset.key = key;
      g.setAttribute('transform', `translate(${p[0]},${p[1]})`);
      g.dataset.base = `translate(${p[0]},${p[1]})`;

      // 标签：包裹层负责定位 + 反缩放
      const labelWrap = svgEl('g');
      labelWrap.setAttribute('transform', `translate(${p[0]},${p[1]})`);
      const label = svgEl('text', { class: 'map-label', x: 0, y: -14 });
      label.textContent = place.name;
      labelWrap.appendChild(label);

      this.nodesG.appendChild(g);
      this.labelsG.appendChild(labelWrap);

      // hover：圆点稍微放大（JS tween，避免覆盖反缩放 transform）
      g.addEventListener('mouseenter', () => this._hoverNode(key, true));
      g.addEventListener('mouseleave', () => this._hoverNode(key, false));

      this.nodes.set(key, { ...node, place, label, labelWrap, lp: [p[0], p[1]] });
      if (this._growing && !this._revealed.has(key)) {
        g.style.visibility = label.style.visibility = 'hidden';
      }
    }
    this._applyCamera(this.camera.cam);
  }

  _hoverNode(key, on) {
    const node = this.nodes.get(key);
    if (!node) return;
    if (on && this.activeKey === key) return;
    const target = on ? NODE.activeR : NODE.coreR;
    tween({
      from: { r: parseFloat(node.core.getAttribute('r')) },
      to: { r: target },
      duration: 180,
      ease: EASE_OUT,
      onUpdate: (v) => node.core.setAttribute('r', v.r),
    });
  }

  _key(place) {
    return String(place.name || '').toLowerCase();
  }

  // ---- 路线 ----
  setRoutes(journeys) {
    this._allJourneys = journeys;
    this.routesG.innerHTML = '';
    const ids = new Set(journeys.map((j) => j.id));
    for (const id of this.routes.keys()) {
      if (!ids.has(id)) this.routes.delete(id);
    }
    for (const j of journeys) {
      this._buildRoute(j);
    }
    this._positionHead();
  }

  _buildRoute(journey) {
    const places = this._journeyPlaces(journey.id);
    if (places.length < 2) return;
    const g = svgEl('g', { class: 'route', 'data-journey': journey.id });
    const route = this.routes.get(journey.id) || { legs: [], run: 0 };
    const legs = [];
    {
      const [from, to] = places;
      const paths = greatCirclePaths(this.project, from, to);
      for (const [part, d] of paths.entries()) {
        // 发光底层
        const glow = svgEl('path', {
          d,
          fill: 'none',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
        glow.style.cssText = `stroke: var(--accent); stroke-width: ${ROUTE.glowWidth}px; opacity: ${ROUTE.glowOpacity};`;
        // 主线条
        const line = svgEl('path', {
          d,
          fill: 'none',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
        line.style.cssText = `stroke: var(--accent); stroke-width: ${ROUTE.strokeWidth}px; opacity: ${ROUTE.opacity};`;
        line.style.visibility = glow.style.visibility = 'hidden';
        g.appendChild(glow);
        g.appendChild(line);
        // Retain the object an in-flight tween owns when projection/DOM changes.
        const leg = route.legs[legs.length] || {};
        Object.assign(leg, { line, glow, from, to, endsAtPlace: part === paths.length - 1, parts: paths.length });
        legs.push(leg);
      }
    }
    this.routesG.appendChild(g);
    const progress = this._routeProgress?.get(journey.id) || [];
    legs.forEach((leg, i) => {
      leg.length = leg.line.getTotalLength();
      this._paintLeg(leg, progress[i] ?? leg.progress ?? 0);
    });
    Object.assign(route, { g, legs });
    this.routes.set(journey.id, route);
  }

  // Dash lengths and point-at-length share local SVG units. Do not use
  // non-scaling-stroke here: under zoom its dashes use a different metric.
  _paintLeg(leg, progress = 0) {
    leg.progress = Math.max(0, Math.min(1, progress));
    const length = leg.length;
    const k = this.camera.cam.k;
    for (const [path, width] of [[leg.line, ROUTE.strokeWidth], [leg.glow, ROUTE.glowWidth]]) {
      path.style.strokeWidth = `${width / k}px`;
      path.style.visibility = leg.progress > 0 && length > 0 ? 'visible' : 'hidden';
      path.setAttribute('stroke-dasharray', leg.progress >= 1 ? 'none' : `${length} ${length}`);
      path.setAttribute('stroke-dashoffset', String(length * (1 - leg.progress)));
    }
  }

  _positionHead() {
    const active = this._activeDraw;
    if (!active) return;
    const { leg, head } = active;
    if (head.parentNode !== this.nodesG) this.nodesG.appendChild(head);
    const pt = leg.line.getPointAtLength(leg.length * leg.progress);
    head.setAttribute('transform', `translate(${pt.x},${pt.y}) scale(${1 / this.camera.cam.k})`);
  }

  _journeyPlaces(journeyId) {
    const places = this._allJourneyPlaces.get(journeyId) || [];
    const start = places.find(p => p.role === 'start') || places[0];
    const destination = places.find(p => p.role === 'destination') || places[places.length - 1];
    return start ? (destination && destination !== start ? [start, destination] : [start]) : [];
  }

  setJourneyPlaces(map) {
    this._allJourneyPlaces = map; // journeyId -> sorted places[]
  }

  /** 绘制某旅程路线（逐段 0%→100%，节点依次亮起；reveal 时节点随抵达依次出现） */
  async animateRoute(journeyId, { dim = true, reveal = false, stepDelay = 70, pulseDuration = 380 } = {}) {
    const route = this.routes.get(journeyId);
    if (!route) return;
    if (this._routePlayback || this._activeDraw || this._journeyWait) this.cancelRoutePlayback();
    const run = ++route.run;
    const playback = { journeyId, run };
    this._routePlayback = playback;
    try {
    if (dim) this.dimRoutesExcept(journeyId);
    for (let i = 0; i < route.legs.length; i++) {
      if (this._routePlayback !== playback || route.run !== run) return false;
      const leg = route.legs[i];
      if (leg.progress >= 1) {
        if (reveal) this.revealNode(this._key(leg.to));
        continue;
      }
      await this._drawLeg(leg, this._legDuration(leg.from, leg.to) / leg.parts, () => this._storeRouteProgress(journeyId, route));
      if (route.run !== run) return false;
      this._storeRouteProgress(journeyId, route);
      if (!leg.endsAtPlace) continue;
      const key = this._key(leg.to);
      if (reveal) this.revealNode(key);
      await this.pulseNode(key, pulseDuration);
      if (route.run !== run) return false;
      await sleep(stepDelay);
    }
    return true;
    } finally {
      if (this._routePlayback === playback) this._routePlayback = null;
    }
  }

  cancelRoutePlayback() {
    this._playbackEpoch = (this._playbackEpoch || 0) + 1;
    this._routePlayback = null;
    for (const route of this.routes.values()) route.run++;
    this._activeDraw?.cancel();
    this._cancelCameraMotion?.();
    this.continueJourney();
  }

  _storeRouteProgress(journeyId, route) {
    if (!this._routeProgress) this._routeProgress = new Map();
    this._routeProgress.set(journeyId, route.legs.map((leg) => leg.progress || 0));
  }

  waitForJourneyContinue() {
    const epoch = this._playbackEpoch;
    return new Promise((resolve) => {
      this._journeyWait = { epoch, resolve };
    });
  }

  continueJourney() {
    const wait = this._journeyWait;
    if (!wait) return false;
    this._journeyWait = null;
    const current = wait.epoch === this._playbackEpoch;
    wait.resolve(current);
    return current;
  }

  /** 隐藏所有路线，取消旧绘制及等待，供 Replay 使用。 */
  hideAllRoutes() {
    this.cancelRoutePlayback();
    for (const [id, route] of this.routes) {
      this.hideRoute(id);
      route.g.style.opacity = 1;
    }
  }

  /** 隐藏单条路线（保存新旅程后重放生长前使用） */
  hideRoute(journeyId) {
    const route = this.routes.get(journeyId);
    if (!route) return;
    route.run++;
    if (route.legs.includes(this._activeDraw?.leg)) this._activeDraw.cancel();
    for (const leg of route.legs) {
      this._paintLeg(leg, 0);
    }
    this._storeRouteProgress(journeyId, route);
  }

  /** 生长准备：彻底隐藏所有路线 + 节点 + 标签（visibility 级别），清空已点亮记录。
   *  用 visibility:hidden 而非仅 opacity——任何 opacity/label/resize/camera 逻辑都无法把未抵达的终点重新显示。 */
  resetForGrowth() {
    this._revealed = new Set();
    for (const node of this.nodes.values()) {
      node.g.style.visibility = 'hidden';
      node.g.style.opacity = 0;
      node.g.setAttribute('transform', node.g.dataset.base);
      if (node.label) {
        node.label.style.visibility = 'hidden';
        node.label.style.opacity = 0;
        node.label.removeAttribute('transform');
      }
    }
    this.hideAllRoutes();
  }

  /** 让某节点以 fade+scale(0.75→1) 出现，随后城市名淡入上浮（生长序列中，只点亮一次） */
  revealNode(key, { labelDelay = 110 } = {}) {
    const node = this.nodes.get(key);
    if (!node || this._revealed.has(key)) return;
    this._revealed.add(key);
    nodeEnter(node.g, { duration: 320 });
    // 节点出现后，城市名延迟淡入上浮
    if (node.labelWrap) {
      labelEnter(node.labelWrap, { delay: labelDelay, duration: 260 });
    }
  }

  /** 保留距离曲线，在上一版基础上再加速 10%。 */
  _legDuration(from, to) {
    const km = d3.geoDistance([from.lng, from.lat], [to.lng, to.lat]) * 6371;
    return Math.min(5400, 2500 + km) / 1.18 / 1.18 / 1.10;
  }

  /** 开场生长：按时间顺序，逐段旅程「起点出现 → 路线生长 → 城市依次点亮」 */
  async playEnterGrowth(journeys = this._allJourneys) {
    const epoch = this._playbackEpoch;
    this._growing = true;
    const sorted = [...journeys].sort((a, b) =>
      (a.startDate || '') < (b.startDate || '') ? -1 : 1
    );
    try {
      for (const j of sorted) {
        if (epoch !== this._playbackEpoch) return;
        const places = this._journeyPlaces(j.id);
        if (!places.length) continue;
        if (places.length === 1 || !this.routes.has(j.id)) {
          this.revealNode(this._key(places[0]));
          await sleep(80);
          continue;
        }
        // 起点先出现
        this.revealNode(this._key(places[0]));
        await sleep(40);
        if (epoch !== this._playbackEpoch) return;
        const completed = await this.animateRoute(j.id, { dim: false, reveal: true, stepDelay: 60, pulseDuration: 360 });
        if (!completed || epoch !== this._playbackEpoch) return;
        await sleep(120);
      }
      if (epoch !== this._playbackEpoch) return;
      // 兜底：未覆盖的节点
      for (const key of this.nodes.keys()) this.revealNode(key);
    } finally {
      if (epoch === this._playbackEpoch) this._growing = false;
      // 生长结束后，按当前缩放阈值重新决定标签显隐
      this._updateLabels(this.camera.cam.k);
    }
  }

  /** 单一 progress 同时驱动实线、底层和头部；每帧缓存以支持重绘。 */
  _drawLeg(leg, duration, onProgress = () => {}) {
    // travel head：生长期间一个极轻亮点跟随路线头部移动（世界坐标 + 相机反缩放保持屏幕尺寸）
    const head = svgEl('g', { class: 'travel-head' });
    const halo = svgEl('circle', { r: 7 });
    halo.style.cssText = 'fill: var(--accent); opacity: 0.18;';
    const dot = svgEl('circle', { r: 2.6 });
    dot.style.cssText = 'fill: var(--accent);';
    head.appendChild(halo);
    head.appendChild(dot);
    this.nodesG.appendChild(head);

    head.style.pointerEvents = 'none';
    return new Promise((resolve) => {
      let animation;
      const finish = () => {
        head.remove();
        if (this._activeDraw?.head === head) this._activeDraw = null;
        resolve();
      };
      this._activeDraw = { leg, head, cancel: () => { animation.cancel(); finish(); } };
      this._positionHead();
      animation = tween({
        from: leg.progress,
        to: 1,
        duration: duration * (1 - leg.progress),
        // Gentle acceleration/deceleration, without the old fast ease-out jump.
        ease: (t) => t * t * (3 - 2 * t),
        onUpdate: (progress) => {
          this._paintLeg(leg, progress);
          this._positionHead();
          onProgress();
        },
        onComplete: finish,
      });
    });
  }

  /** 高亮某旅程路线，其余淡出 */
  dimRoutesExcept(journeyId) {
    for (const [id, route] of this.routes) {
      const dim = id !== journeyId;
      route.g.style.opacity = dim ? 0.12 : 1;
      route.g.style.transition = 'opacity 280ms cubic-bezier(0.22,1,0.36,1)';
    }
  }

  resetRoutes() {
    for (const route of this.routes.values()) {
      route.g.style.opacity = 1;
      route.legs.forEach((leg) => {
        this._paintLeg(leg, leg.progress);
      });
      const id = route.g.dataset.journey;
      if (id) this._storeRouteProgress(id, route);
    }
  }

  showAllRoutes() {
    for (const route of this.routes.values()) {
      route.g.style.opacity = 1;
    }
  }

  // ---- 节点动画 ----
  async pulseNode(key, duration = 500) {
    const node = this.nodes.get(key);
    if (!node) return;
    await nodePulse(node.g, { duration }).promise;
  }

  activateNode(key) {
    const prev = this.nodes.get(this.activeKey);
    if (prev) {
      prev.g.classList.remove('is-active');
      prev.label.style.opacity = this.camera.cam.k >= 2.2 ? 1 : 0;
    }
    const node = this.nodes.get(key);
    if (node) {
      this.activeKey = key;
      node.g.classList.add('is-active');
      nodeActivate(node.g, { active: true });
      node.label.style.opacity = 1;
    }
  }

  clearActive() {
    const prev = this.nodes.get(this.activeKey);
    if (prev) {
      prev.g.classList.remove('is-active');
      nodeActivate(prev.g, { active: false });
      this._updateLabels(this.camera.cam.k);
    }
    this.activeKey = null;
  }

  _updateLabels(k) {
    // 生长动画期间，标签显隐由 revealNode 控制，不受缩放阈值影响
    if (this._growing) return;
    const show = k >= 2.2;
    for (const node of this.nodes.values()) {
      const isActive = this.activeKey === this._key(node.place);
      node.label.style.opacity = show || isActive ? 1 : 0;
    }
  }

  // ---- 相机操作 ----
  _moveCamera(start) {
    this._cancelCameraMotion?.();
    this._syncZoomTransform();
    const motion = start();
    return new Promise(resolve => {
      const finish = () => {
        if (this._cancelCameraMotion === cancel) {
          this._cancelCameraMotion = null;
          this._syncZoomTransform();
        }
        resolve();
      };
      const cancel = () => { motion.cancel?.(); finish(); };
      this._cancelCameraMotion = cancel;
      Promise.resolve(motion.promise || motion).then(finish);
    });
  }

  // 注意：返回 Promise（而非 tween 句柄），保证 `await mapView.flyTo(...)` 真正等待动画结束
  flyTo(lngLat, opts) {
    return this._moveCamera(() => this.camera.flyTo(lngLat, opts));
  }

  fitTo(points, opts) {
    return this._moveCamera(() => this.camera.fitTo(points, opts));
  }

  resetView(opts) {
    return this._moveCamera(() => this.camera.reset(opts));
  }

  // ---- 进入动画 ----
  async enterAnimation({ focusPoints = [] } = {}) {
    if (this.entered) return;
    this.entered = true;
    // 先隐藏路线 + 节点 + 标签，避免淡入时闪现完整足迹
    this.resetForGrowth();
    const epoch = this._playbackEpoch;
    // 进入生长状态：标签显隐改由 revealNode 控制，不再受缩放阈值干扰
    this._growing = true;

    // ① 第一帧就处于目标视角：淡入前同步定位到旅行区域（或世界视角）
    if (focusPoints.length) {
      this._setViewImmediate(focusPoints);
    } else {
      this.camera.set(this.baseTranslate[0], this.baseTranslate[1], 1);
    }

    // ② 地图淡入（此时已处于旅行区域，不显空）
    this.root.style.opacity = 0;
    await tween({
      from: { o: 0 },
      to: { o: 1 },
      duration: 320,
      onUpdate: (v) => (this.root.style.opacity = v.o),
    }).promise;

    if (epoch !== this._playbackEpoch) return;
    // ③ 轻微缩放呼吸：目标 k * 1.04 → k（营造进入感，但不动镜头范围）
    const cam = this.camera.cam;
    const fromK = cam.k * 1.04;
    await tween({
      from: { k: fromK },
      to: { k: cam.k },
      duration: 460,
      ease: EASE_OUT,
      onUpdate: (v) => {
        if (epoch !== this._playbackEpoch) return;
        cam.k = v.k;
        this.camera.apply();
      },
    }).promise;

    if (epoch !== this._playbackEpoch) return;
    // ④ 路线生长：起点出现 → 逐段生长 → 城市依次点亮
    await this.playEnterGrowth();
  }

  /** 同步（无动画）定位到一组地点：单点用 flyTo target，多点用 bbox fit */
  _setViewImmediate(points) {
    if (points.length === 1) {
      const p = this.project(points[0]);
      const k = 5;
      this.camera.set(this.width / 2 - p[0] * k, this.height / 2 - p[1] * k, k);
    } else {
      this.camera.fitImmediate(points, { padding: 110, maxK: 8 });
    }
    this._syncZoomTransform();
  }

  /** 自动聚焦到一组地点（单点 flyTo；多点 bbox fit；空则不动） */
  focusOnPlaces(points, { padding = 110, maxK = 8, duration } = {}) {
    if (!points.length) return Promise.resolve();
    if (points.length === 1) return this.flyTo(points[0], { k: 5 });
    return this.fitTo(points, { padding, maxK, ...(duration ? { duration } : {}) });
  }

  // ---- 聚焦调暗 ----
  setFocusing(on) {
    this.focusing = on;
    this.root.classList.toggle('is-focusing', on);
  }

  resize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    // 尺寸未变（如无头环境偶发 resize 事件），直接跳过，避免无谓重渲染
    if (w === this.width && h === this.height) return;
    // 记录当前视角（地理中心 + 缩放），重投影后尽量恢复
    const cam = this.camera.cam;
    const prevK = cam.k;
    let centerLngLat = null;
    try {
      const cx = (this.width / 2 - cam.x) / cam.k;
      const cy = (this.height / 2 - cam.y) / cam.k;
      centerLngLat = this.proj.invert([cx, cy]);
    } catch {}

    this.width = w;
    this.height = h;
    this._setupProj();
    // 重设 svg 与相机
    this._setupCamera();
    this._applyCamera(this.camera.cam);
    // 重新渲染底图与节点/路线
    const world = this.svg.querySelector('.world');
    world.innerHTML = '';
    renderBaseLayers(world, { data: this.data, path: this.path });
    world.appendChild(this.routesG);
    world.appendChild(this.nodesG);
    world.appendChild(this.labelsG);
    // 重新投影节点
    for (const [key, node] of this.nodes) {
      const p = this.project([node.place.lng, node.place.lat]);
      node.g.dataset.base = `translate(${p[0]},${p[1]})`;
      node.g.setAttribute('transform', `translate(${p[0]},${p[1]})`);
      node.lp = [p[0], p[1]];
      node.labelWrap.setAttribute('transform', `translate(${p[0]},${p[1]})`);
    }
    // 重新投影路线
    this.setRoutes(this._allJourneys);
    // 恢复视角（保持缩放与地理中心）；路线重新显示
    if (centerLngLat && isFinite(centerLngLat[0]) && isFinite(centerLngLat[1])) {
      const p = this.project(centerLngLat);
      this.camera.set(this.width / 2 - p[0] * prevK, this.height / 2 - p[1] * prevK, prevK);
    } else {
      this.camera.set(this.baseTranslate[0], this.baseTranslate[1], 1);
    }
    if (this.entered && !this._growing) this.resetRoutes();
    this._syncZoomTransform();
  }

  setJourneysById(map) {
    this._journeysById = map;
  }
}
