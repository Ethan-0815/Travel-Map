// map/nodes.js — 城市节点 + 发光/脉冲动画
import { NODE } from '../config.js';
import { tween, EASE_OUT } from '../core/tween.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * 创建一个城市节点 <g>（基准空间坐标）
 * 结构：外层 g 定位+动画缩放；内层 g 由相机反缩放，保持恒定屏幕尺寸
 * @param {[number,number]} p 基准投影坐标
 */
export function createNode(p, { name = '', r = NODE.coreR } = {}) {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'map-node');
  g.setAttribute('transform', `translate(${p[0]},${p[1]})`);
  g.dataset.name = name;

  const inner = document.createElementNS(NS, 'g');
  inner.setAttribute('class', 'node-inner');

  const halo = document.createElementNS(NS, 'circle');
  halo.setAttribute('class', 'node-halo');
  halo.setAttribute('r', NODE.haloR);
  halo.setAttribute('fill', 'none');

  const core = document.createElementNS(NS, 'circle');
  core.setAttribute('class', 'node-core');
  core.setAttribute('r', r);
  core.setAttribute('style', `fill: var(--accent); filter: drop-shadow(0 0 6px var(--accent-glow));`);

  inner.appendChild(halo);
  inner.appendChild(core);
  g.appendChild(inner);
  return { g, inner, core, halo };
}

/** 节点出现动画：fade + scale(0.75→1)。同时从 visibility:hidden 恢复（配合生长动画的彻底隐藏）。 */
export function nodeEnter(g, { delay = 0, duration = 320 } = {}) {
  g.style.visibility = 'visible';
  g.style.opacity = 0;
  g.style.transformBox = 'fill-box';
  g.style.transformOrigin = 'center';
  return tween({
    from: { o: 0, s: 0.75 },
    to: { o: 1, s: 1 },
    duration,
    delay,
    ease: EASE_OUT,
    onUpdate: (v) => {
      g.style.opacity = v.o;
      g.setAttribute('transform', `${g.dataset.base} scale(${v.s})`);
    },
  });
}

/** 标签出现动画：淡入 + 上浮（y 从 +6 → 0）。labelWrap 定位由相机反缩放管理，这里只动内部 text。 */
export function labelEnter(labelWrap, { delay = 0, duration = 260 } = {}) {
  const text = labelWrap.querySelector('.map-label');
  if (!text) return tween({ from: { o: 0 }, to: { o: 0 }, duration: 0 });
  text.style.visibility = 'visible';
  text.style.opacity = 0;
  return tween({
    from: { o: 0, y: 6 },
    to: { o: 1, y: 0 },
    duration,
    delay,
    ease: EASE_OUT,
    onUpdate: (v) => {
      text.style.opacity = v.o;
      text.setAttribute('transform', `translate(0,${v.y})`);
    },
    onComplete: () => text.setAttribute('transform', 'translate(0,0)'),
  });
}

/** 点亮节点（Replay 中依次亮起）：扩散脉冲一次（附加到内层，保持屏幕尺寸恒定） */
export function nodePulse(inner, { duration = 500 } = {}) {
  const pulse = document.createElementNS(NS, 'circle');
  pulse.setAttribute('r', NODE.coreR);
  pulse.setAttribute('fill', 'none');
  pulse.setAttribute('stroke', 'var(--accent)');
  pulse.setAttribute('stroke-width', '1.5');
  pulse.setAttribute('pointer-events', 'none');
  inner.appendChild(pulse);

  return tween({
    from: { r: NODE.coreR, o: 0.7 },
    to: { r: NODE.coreR * 2.6, o: 0 },
    duration,
    ease: EASE_OUT,
    onUpdate: (v) => {
      pulse.setAttribute('r', v.r);
      pulse.style.opacity = v.o;
    },
    onComplete: () => pulse.remove(),
  });
}

/** 激活态：放大核心 */
export function nodeActivate(g, { active = true, duration = 280 } = {}) {
  const core = g.querySelector('.node-core');
  const target = active ? NODE.activeR : NODE.coreR;
  return tween({
    from: { r: parseFloat(core.getAttribute('r')) },
    to: { r: target },
    duration,
    ease: EASE_OUT,
    onUpdate: (v) => core.setAttribute('r', v.r),
  });
}
