// core/easing.js — cubic-bezier 数值求解器
// 与 CSS cubic-bezier(0.22, 1, 0.36, 1) 保持一致的 JS 实现

// 牛顿迭代求 x -> t
function solveCurveX(x, x1, x2) {
  let t = x;
  for (let i = 0; i < 8; i++) {
    const xGuess = bezier(t, x1, x2);
    if (Math.abs(xGuess - x) < 1e-4) return t;
    const dx = bezierSlope(t, x1, x2);
    if (Math.abs(dx) < 1e-6) break;
    t -= (xGuess - x) / dx;
  }
  // 二分兜底
  let lo = 0;
  let hi = 1;
  t = x;
  while (lo < hi) {
    const xGuess = bezier(t, x1, x2);
    if (Math.abs(xGuess - x) < 1e-4) return t;
    if (xGuess < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

function bezier(t, x1, x2) {
  const u = 1 - t;
  return 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
}

function bezierSlope(t, x1, x2) {
  const u = 1 - t;
  return (
    3 * u * u * x1 +
    6 * u * t * (x2 - x1) +
    3 * t * t * (1 - x2)
  );
}

/**
 * 生成 cubic-bezier(x1,y1,x2,y2) 缓动函数
 * @returns {(t:number)=>number}
 */
export function cubicBezier(x1, y1, x2, y2) {
  const LUT_SIZE = 64;
  const lut = new Float32Array(LUT_SIZE + 1);
  for (let i = 0; i <= LUT_SIZE; i++) {
    const t = solveCurveX(i / LUT_SIZE, x1, x2);
    const u = 1 - t;
    lut[i] = 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
  }
  return function (t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const pos = t * LUT_SIZE;
    const i = Math.floor(pos);
    const frac = pos - i;
    return lut[i] + (lut[i + 1] - lut[i]) * frac;
  };
}

// 预置缓动
export const EASE_OUT = cubicBezier(0.22, 1, 0.36, 1);
export const EASE_IN_OUT = cubicBezier(0.65, 0, 0.35, 1);
export const EASE_LINEAR = (t) => t;
