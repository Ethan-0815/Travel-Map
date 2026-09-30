// views/footprintMap.js — Stats 页「足迹缩略地图」：静态、不可交互的迷你世界地图
// 复用现有底图数据与投影，渲染陆地 + 国界 + 城市点 + 路线，自动适配足迹范围。
import { setupProjection } from '../map/projection.js';
import { loadMapData, renderBaseLayers, svgEl } from '../map/layers.js';
import { greatCirclePaths } from '../map/routes.js';
import { computeFit } from '../map/camera.js';
import { NODE, ROUTE } from '../config.js';

/**
 * 构建足迹缩略 SVG
 * @param {object} opts
 * @param {number} opts.width / opts.height 容器尺寸
 * @param {Array} opts.places 去重后的地点 [{name, lat, lng}]
 * @param {Array} opts.journeys journeys 数组
 * @param {(journeyId)=>Array} opts.placesByJourney 按旅程取地点（含 seq 排序）
 * @returns {SVGElement}
 */
export async function buildFootprintMap({ width, height, places, journeys, placesByJourney }) {
  const data = await loadMapData();

  const { path, baseScale, baseTranslate, project } = setupProjection(width, height);
  const svg = svgEl('svg', { class: 'footprint-svg', width, height, viewBox: `0 0 ${width} ${height}` });

  // 全屏海洋背景
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width, height, fill: 'var(--map-ocean-1)' }));

  // 世界组
  const world = svgEl('g', { class: 'world' });

  // 底图（陆地 + 国界 + 中国 + 九段线）
  renderBaseLayers(world, { data, path });

  // 路线（细线）
  const routesG = svgEl('g');
  for (const j of journeys) {
    const ps = placesByJourney(j.id);
    if (ps.length < 2) continue;
    for (let i = 1; i < ps.length; i++) {
      const a = ps[i - 1];
      const b = ps[i];
      for (const d of greatCirclePaths(project, a, b)) {
        routesG.appendChild(
          svgEl('path', {
            d,
            fill: 'none',
            'stroke-linecap': 'round',
            'vector-effect': 'non-scaling-stroke',
          }, `stroke: var(--accent); stroke-width: ${ROUTE.strokeWidth}px; opacity: ${ROUTE.opacity};`)
        );
      }
    }
  }
  world.appendChild(routesG);

  // 城市点
  const nodesG = svgEl('g');
  for (const p of places) {
    if (p.lat == null || p.lng == null || !isFinite(p.lat) || !isFinite(p.lng)) continue;
    const [x, y] = project([p.lng, p.lat]);
    const g = svgEl('g', { transform: `translate(${x},${y})` });
    g.appendChild(svgEl('circle', { r: NODE.coreR }, `fill: var(--accent);`));
    nodesG.appendChild(g);
  }
  world.appendChild(nodesG);

  // 适配足迹范围（有数据时缩放到 bbox，否则世界视角）
  const validPoints = places
    .filter((p) => p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng))
    .map((p) => [p.lng, p.lat]);
  let tx = baseTranslate[0];
  let ty = baseTranslate[1];
  let k = 1;
  if (validPoints.length) {
    const fit = computeFit(validPoints, { padding: 28, maxK: 6, width, height, project });
    tx = fit.x;
    ty = fit.y;
    k = fit.k;
  }
  world.setAttribute('transform', `translate(${tx},${ty}) scale(${k})`);
  // The camera magnifies geography, not city markers.
  for (const dot of nodesG.querySelectorAll('circle')) dot.setAttribute('r', 3 / k);

  svg.appendChild(world);
  return svg;
}
