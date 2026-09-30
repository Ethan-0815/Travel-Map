// celebratetest.mjs — 保存新旅程的庆祝反馈（toast + count-up）验证
// 单次 navigate 会话（无 reload），rAF 全程正常，规避无头 rAF 停摆干扰
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9364;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
  '--user-data-dir=' + process.env.TEMP + '/edge-cele-' + Date.now() + '-profile',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await res.json();
    target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (target) break;
  } catch {}
  await sleep(300);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
const exceptions = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    exceptions.push(d.text + ' ' + (d.exception?.description || ''));
  }
};
const send = (m, p = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const rafProbe = async (label) => {
  const r = await Promise.race([
    ev(`new Promise((res) => requestAnimationFrame(() => res('fired')))`),
    new Promise((res) => setTimeout(() => res('STOPPED'), 1200)),
  ]);
  console.log('  [rAF]', label, '->', r);
  return r === 'fired';
};

let exitCode = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) exitCode = 1; };

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
await sleep(9000); // Demo 进入动画完成
await rafProbe('进入动画完成后');

console.log('== 打开表单，创建 上海 → 北京 ==');
await ev(`document.querySelector('.map-add-btn').click()`);
await sleep(900);
await rafProbe('表单打开后');
await ev(`(() => {
  const input = document.querySelector('.form-wrap .field .input');
  input.value = 'Celebrate Test';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
for (const [role, btnText, city] of [['start', '添加起点', '上海'], ['destination', '添加终点', '北京']]) {
  await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find(b => b.textContent.includes(${JSON.stringify(btnText)})).click()`);
  await sleep(400);
  await ev(`(() => {
    const card = document.querySelector('.place-card[data-role="${role}"]');
    const input = card.querySelector('.city-search .input');
    input.value = ${JSON.stringify(city)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(400);
  await ev(`document.querySelector('.place-card[data-role="${role}"] .city-suggest-item').click()`);
  await sleep(400);
}
await ev(`document.querySelector('.form-wrap .btn-primary').click()`);
// 决定性手段：用 setTimeout shim 替换 rAF，绕开无头 compositor 帧调度（已知 headless 帧调度缺陷）。
// tween 引擎调用全局 requestAnimationFrame，shim 后动画链可完整推进——验证逻辑而非渲染。
await ev(`(() => {
  if (window.__rafShimmed) return;
  window.__rafShimmed = true;
  const nativeRAF = window.requestAnimationFrame.bind(window);
  window.__usingShim = true;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
})()`);
await sleep(500);
await rafProbe('保存后 0.5s');
await sleep(2000);
await rafProbe('保存后 2.5s');

// 轮询 toast（庆祝动画 ≈2s 后出现，2.2s 后消失）
let toastSeen = false;
let toastAnyText = null;
let numsFinal = null;
const nums = () => ev(`[...document.querySelectorAll('.map-stats .num')].map(n => n.textContent)`);
for (let i = 0; i < 25; i++) {
  const t = await ev(`(() => { const el = document.querySelector('.toast'); return el ? { shown: el.classList.contains('is-show'), text: el.textContent } : null; })()`);
  if (t && t.text && !toastAnyText) toastAnyText = t.text;
  if (t && t.shown && (t.text.includes('旅程已添加') || t.text.includes('Journey added'))) { toastSeen = true; break; }
  await sleep(300);
}
console.log('  toast 文本采样:', JSON.stringify(toastAnyText));
console.log(toastSeen ? '  ✓ toast「旅程已添加」出现' : '  ✗ toast 未捕捉到');
if (!toastSeen) exitCode = 1;

// count-up：庆祝后 _animateStats 触发，轮询到 8/5（Demo 7 城 + 北京已在 Demo？北京重复 → 仍 7）
// Demo: Beijing/Shanghai/Hangzhou/Tokyo/Paris/Zurich/Rome = 7 城；新旅程 上海→北京 无新城 → 仍 7/5
for (let i = 0; i < 15; i++) {
  numsFinal = await nums();
  if (JSON.stringify(numsFinal) === '["7","5"]') break;
  await sleep(400);
}
console.log((JSON.stringify(numsFinal) === '["7","5"]' ? '  ✓ ' : '  ✗ ') + 'count-up 最终稳定 ' + JSON.stringify(numsFinal));
if (JSON.stringify(numsFinal) !== '["7","5"]') exitCode = 1;

// 新旅程路线已绘制（dashoffset=0）
const routeDrawn = await ev(`(() => {
  const g = document.querySelector('.route[data-journey]');
  const legs = [...document.querySelectorAll('.route path')].filter(p => p.getAttribute('stroke-dashoffset') !== null);
  const drawn = legs.filter(p => parseFloat(p.getAttribute('stroke-dashoffset')) < 0.01);
  return { legs: legs.length, drawn: drawn.length };
})()`);
console.log((routeDrawn.drawn === routeDrawn.legs && routeDrawn.legs > 0 ? '  ✓ ' : '  ✗ ') + '新旅程路线生长完成 ' + JSON.stringify(routeDrawn));
if (!(routeDrawn.drawn === routeDrawn.legs && routeDrawn.legs > 0)) exitCode = 1;

console.log('== EXCEPTIONS: ' + exceptions.length + ' ==');
exceptions.slice(0, 5).forEach((e) => console.log('  ✗', e));
if (exceptions.length) exitCode = 1;
console.log(exitCode ? 'CELEBRATE FAIL' : 'CELEBRATE PASS');
ws.close();
edge.kill();
process.exit(exitCode);
