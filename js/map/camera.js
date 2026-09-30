// map/camera.js — 相机（平移/缩放）封装
import { motion, PROJECTION } from '../config.js';
import { tween, EASE_OUT } from '../core/tween.js';

/**
 * @param {object} opts
 * @param {number} opts.width / opts.height 视口尺寸
 * @param {[number,number]} opts.baseTranslate fitExtent 得到的基准 translate
 * @param {(lngLat:[number,number])=>[number,number]} opts.project 基准投影
 * @param {(cam:object)=>void} opts.onChange 相机变化回调
 */
export function createCamera({ width, height, baseTranslate, project, onChange }) {
  const cam = {
    x: baseTranslate[0],
    y: baseTranslate[1],
    k: 1,
    width,
    height,
    minK: PROJECTION.minZoom,
    maxK: PROJECTION.maxZoom,
  };

  function apply() {
    if (onChange) onChange(cam);
  }

  function set(x, y, k) {
    cam.x = x;
    cam.y = y;
    cam.k = Math.min(cam.maxK, Math.max(cam.minK, k));
    apply();
  }

  function reset({ duration = motion.map, ease = EASE_OUT } = {}) {
    return tween({
      from: { x: cam.x, y: cam.y, k: cam.k },
      to: { x: baseTranslate[0], y: baseTranslate[1], k: 1 },
      duration,
      ease,
      onUpdate: (v) => {
        cam.x = v.x;
        cam.y = v.y;
        cam.k = v.k;
        apply();
      },
    });
  }

  /** 平滑移动到某经纬度并缩放到 k */
  function flyTo(lngLat, { k = 4.5, duration = motion.map, ease = EASE_OUT } = {}) {
    const p = project(lngLat);
    const tx = width / 2 - p[0] * k;
    const ty = height / 2 - p[1] * k;
    return tween({
      from: { x: cam.x, y: cam.y, k: cam.k },
      to: { x: tx, y: ty, k },
      duration,
      ease,
      onUpdate: (v) => {
        cam.x = v.x;
        cam.y = v.y;
        cam.k = v.k;
        apply();
      },
    });
  }

  /** 平滑适配一组坐标（用于 Replay 结束 / 旅程视野 / 自动聚焦）
   *  @param {number} opts.maxK 缩放上限（自动聚焦避免缩得过近）
   */
  function fitTo(lngLats, { padding = 80, duration = motion.map, ease = EASE_OUT, maxK = cam.maxK } = {}) {
    if (!lngLats.length) return Promise.resolve();
    const target = computeFit(lngLats, { padding, maxK, width, height, project });
    return tween({
      from: { x: cam.x, y: cam.y, k: cam.k },
      to: target,
      duration,
      ease,
      onUpdate: (v) => {
        cam.x = v.x;
        cam.y = v.y;
        cam.k = v.k;
        apply();
      },
    });
  }

  /** 立即（无动画）适配一组坐标 */
  function fitImmediate(lngLats, opts = {}) {
    if (!lngLats.length) return;
    const { x, y, k } = computeFit(lngLats, { padding: opts.padding ?? 80, maxK: opts.maxK ?? cam.maxK, width, height, project });
    cam.x = x;
    cam.y = y;
    cam.k = Math.min(cam.maxK, Math.max(cam.minK, k));
    apply();
  }

  return { cam, apply, set, reset, flyTo, fitTo, fitImmediate };
}

/** 纯函数：由一组经纬度计算 bbox 适配的相机 {x,y,k}（无副作用） */
export function computeFit(lngLats, { padding = 80, maxK, width, height, project }) {
  if (!lngLats.length) return { x: 0, y: 0, k: 1 };
  const pts = lngLats.map((ll) => project(ll));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const k = Math.min(
    maxK,
    Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY)
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const tx = width / 2 - cx * k;
  const ty = height / 2 - cy * k;
  return { x: tx, y: ty, k };
}
