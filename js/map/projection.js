// map/projection.js — 投影设置
import { PROJECTION } from '../config.js';

/**
 * 建立投影：
 * - 用 fitExtent 计算全球基准 scale 与 translate
 * - 提供 translate=[0,0] 的 baseProjection，坐标落在「基准空间」
 *   再由相机 group 的 transform(translate(x,y) scale(k)) 定位
 */
export function setupProjection(width, height) {
  const pad = PROJECTION.padding;
  const fit = d3.geoNaturalEarth1();
  fit.fitExtent(
    [
      [pad, pad],
      [width - pad, height - pad],
    ],
    { type: 'Sphere' }
  );
  const baseScale = fit.scale();
  const baseTranslate = fit.translate();

  const proj = d3.geoNaturalEarth1().scale(baseScale).translate([0, 0]);
  const path = d3.geoPath(proj);

  function project(lngLat) {
    return proj(lngLat);
  }

  return { proj, path, baseScale, baseTranslate, project };
}
