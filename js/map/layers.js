// map/layers.js — 底图图层（海洋 / 经纬网 / 陆地 / 国界 / 中国合规层）
// 注意：SVG 展示属性不支持 CSS var()，凡是引用 var() 的颜色一律用 style。
const NS = 'http://www.w3.org/2000/svg';

let cache = null;

/** 加载本地 GeoJSON（缓存） */
export async function loadMapData() {
  if (cache) return cache;
  const [land, countries, china, nineDash] = await Promise.all([
    fetch('assets/data/world-land.json').then((r) => r.json()),
    fetch('assets/data/world-countries.json').then((r) => r.json()),
    fetch('assets/data/china-provinces.json').then((r) => r.json()),
    fetch('assets/data/china-nine-dash.json').then((r) => r.json()),
  ]);
  cache = { land, countries, china, nineDash };
  return cache;
}

export function svgEl(tag, attrs = {}, style = null) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    n.setAttribute(k, v);
  }
  if (style) n.style.cssText = style;
  return n;
}

/**
 * 把底图渲染进 worldGroup（基准空间坐标，由相机 transform 定位）
 */
export function renderBaseLayers(worldGroup, { data, path }) {
  // 1) 陆地
  const landG = svgEl('g');
  for (const f of data.land.features) {
    landG.appendChild(
      svgEl(
        'path',
        { d: path(f), fill: 'var(--map-land)' },
        'stroke: var(--map-land-edge); stroke-width: 0.5px;'
      )
    );
  }
  worldGroup.appendChild(landG);

  // 2) 国界（已剔除 China/Taiwan）
  const borders = svgEl('g');
  for (const f of data.countries.features) {
    borders.appendChild(
      svgEl(
        'path',
        { d: path(f), fill: 'none', 'vector-effect': 'non-scaling-stroke' },
        'stroke: var(--map-border); stroke-width: 0.5px;'
      )
    );
  }
  worldGroup.appendChild(borders);

  // 3) 中国省份（覆盖中国，含台湾/香港/澳门为省）
  const china = svgEl('g');
  for (const f of data.china.features) {
    china.appendChild(
      svgEl(
        'path',
        {
          d: path(f),
          fill: 'var(--map-land)',
          'vector-effect': 'non-scaling-stroke',
        },
        'stroke: var(--map-border); stroke-width: 0.4px;'
      )
    );
  }
  worldGroup.appendChild(china);

  // 4) 九段线
  const nineDash = svgEl('g');
  for (const f of data.nineDash.features) {
    nineDash.appendChild(
      svgEl(
        'path',
        {
          d: path(f),
          fill: 'none',
          'stroke-dasharray': '2 2',
          'vector-effect': 'non-scaling-stroke',
        },
        'stroke: var(--map-border); stroke-width: 0.6px;'
      )
    );
  }
  worldGroup.appendChild(nineDash);

  return worldGroup;
}
