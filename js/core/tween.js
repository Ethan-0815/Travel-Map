// core/tween.js — 轻量 tween 引擎 + 共享 rAF 调度器
// 所有动画统一由它驱动，多个 tween 并行共用一个 rAF loop。
import { EASE_OUT, EASE_LINEAR } from './easing.js';

const active = new Map();
let rafId = null;
let idSeq = 0;

function loop(now) {
  rafId = null;
  let remaining = false;
  for (const [id, job] of active) {
    if (job.cancelled) continue;
    if (job.t0 == null) job.t0 = now;
    let t = (now - job.t0) / job.duration;
    if (t > 1) t = 1;
    const e = job.ease(t);
    // 插值：对象 / 数字 / 数组
    const val = interpolate(job.from, job.to, e);
    job.onUpdate(val, e);
    if (t < 1) {
      remaining = true;
    } else {
      active.delete(id);
      const cb = job.onComplete;
      if (cb) cb();
      if (job.resolve) job.resolve(val);
    }
  }
  if (remaining) rafId = requestAnimationFrame(loop);
}

function ensureLoop() {
  if (rafId == null) rafId = requestAnimationFrame(loop);
}

function interpolate(from, to, e) {
  if (typeof from === 'number') return from + (to - from) * e;
  if (Array.isArray(from)) {
    return from.map((v, i) => interpolate(v, to[i], e));
  }
  if (from && typeof from === 'object') {
    const out = {};
    for (const k in from) out[k] = interpolate(from[k], to[k], e);
    return out;
  }
  return e >= 1 ? to : from;
}

/**
 * tween({ from, to, duration, ease, onUpdate, onComplete }) -> { cancel, promise }
 */
export function tween(opts) {
  const {
    from,
    to,
    duration = 280,
    ease = EASE_OUT,
    onUpdate = () => {},
    onComplete,
    delay = 0,
  } = opts;
  const id = ++idSeq;
  const job = {
    id,
    from,
    to,
    duration,
    ease,
    onUpdate,
    onComplete,
    cancelled: false,
    t0: delay > 0 ? null : null,
    delay,
    resolve: null,
  };
  const promise = new Promise((res) => (job.resolve = res));
  active.set(id, job);
  // 处理 delay：简单延迟启动
  if (delay > 0) {
    setTimeout(() => {
      if (!job.cancelled) {
        job.t0 = null; // 首次 loop 重新计时
        ensureLoop();
      }
    }, delay);
  } else {
    ensureLoop();
  }
  return {
    cancel() {
      job.cancelled = true;
      active.delete(id);
    },
    promise,
  };
}

/** 并行运行多个 tween，全部完成后 resolve */
export function parallel(tweens) {
  return Promise.all(tweens.map((t) => (t.promise ? t.promise : Promise.resolve())));
}

/** 顺序运行：每个元素是返回 tween 的函数或 tween */
export async function sequence(steps, { signal } = {}) {
  for (const step of steps) {
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const t = typeof step === 'function' ? step() : step;
    if (t && t.promise) await t.promise;
    else if (t && typeof t === 'object' && t.ms) await sleep(t.ms, { signal });
  }
}

/** 可取消延时 */
export function sleep(ms, { signal } = {}) {
  return new Promise((res, rej) => {
    if (signal && signal.aborted) return rej(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      res();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      rej(new DOMException('Aborted', 'AbortError'));
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** 取消所有进行中的 tween */
export function cancelAll() {
  for (const [, job] of active) job.cancelled = true;
  active.clear();
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// 导出 EASE 供便捷引用
export { EASE_OUT, EASE_LINEAR };
