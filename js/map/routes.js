// map/routes.js — 大圆航线采样 + 反子午线切分 + 路径生成
import { ROUTE } from '../config.js';

/** 两经纬度之间的大圆航线采样点（含首尾） */
export function greatCirclePoints(a, b, n = ROUTE.samples) {
  const interp = d3.geoInterpolate([a.lng, a.lat], [b.lng, b.lat]);
  const pts = new Array(n + 1);
  for (let i = 0; i <= n; i++) pts[i] = interp(i / n);
  return pts;
}

/** 依据经度跳变切分反子午线 */
export function splitAntimeridian(pts) {
  const segments = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const dLng = Math.abs(pts[i][0] - pts[i - 1][0]);
    if (dLng > 180) {
      segments.push(cur);
      cur = [pts[i]];
    } else {
      cur.push(pts[i]);
    }
  }
  if (cur.length) segments.push(cur);
  return segments.filter((s) => s.length > 1);
}

/** 生成路径 d 字符串（投影到基准空间） */
export function greatCirclePaths(project, a, b, n = ROUTE.samples) {
  const pts = greatCirclePoints(a, b, n);
  return splitAntimeridian(pts).map((seg) => {
    const coords = seg.map((p) => {
      const [x, y] = project(p);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return 'M' + coords.join('L');
  });
}
