// v5test.mjs — 第五轮真实用户操作验收
// 清空 IndexedDB → 真实表单操作创建 北京→上海 / 北京→南京→上海 → 高频截图序列肉眼验收
// rAF shim 通过 addScriptToEvaluateOnNewDocument 在 app 启动前注入，规避无头帧调度停摆
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9370;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,TimerThrottlingForBackgroundTabs',
  '--user-data-dir=' + process.env.TEMP + '/edge-v5-' + Date.now() + '-profile',
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
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    exceptions.push(d.text + ' ' + (d.exception?.description || ''));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
  }
};
const send = (m, p = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''));
  return r.result?.result?.value;
};
let shotIdx = 0;
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  if (s.result?.data) writeFileSync(process.env.TEMP + '/' + name, Buffer.from(s.result.data, 'base64'));
  console.log('  shot:', name);
};

// 城市可见性：node g 的 visibility + label 的 visibility/opacity
const cityVis = (name) => ev(`(() => {
  const g = [...document.querySelectorAll('.map-node')].find(x => x.dataset.name === ${JSON.stringify(name)});
  const label = [...document.querySelectorAll('.map-label')].find(t => t.textContent === ${JSON.stringify(name)});
  if (!g) return { found: false };
  return {
    found: true,
    nodeVis: g.style.visibility || 'unset',
    nodeOpacity: g.style.opacity || 'unset',
    labelVis: label ? (label.style.visibility || 'unset') : 'no-label',
    labelOpacity: label ? (label.style.opacity || 'unset') : 'no-label',
  };
})()`);
// 路线 dashoffset（越小越接近画完）
const routeProgress = () => ev(`(() => {
  const lines = [...document.querySelectorAll('.route path')].filter(p => p.getAttribute('stroke-dashoffset') !== null && !p.style.cssText.includes('5px'));
  return lines.map(p => parseFloat(parseFloat(p.getAttribute('stroke-dashoffset')).toFixed(2)));
})()`);
const worldScale = () => ev(`(() => {
  const t = document.querySelector('.world').getAttribute('transform') || '';
  const m = /scale\\(([\\d.]+)\\)/.exec(t);
  return m ? parseFloat(m[1]) : null;
})()`);

let exitCode = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) exitCode = 1; };

await send('Runtime.enable');
await send('Page.enable');
// app 启动前注入 rAF shim（setTimeout 驱动动画，规避无头帧调度停摆）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);`,
});

// ============ 步骤 1：清空数据，确认空地图 ============
console.log('== 1. 清空数据，确认空状态 ==');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
await sleep(4000);
for (let i = 0; i < 10; i++) {
  try {
    await ev(`(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const s of ['journeys','places','photos','blobs','settings']) await new Promise((res) => { const rq = db.transaction(s,'readwrite').objectStore(s).clear(); rq.onsuccess = res; });
      db.close();
    })()`);
    break;
  } catch { await sleep(1500); }
}
await send('Page.reload', { ignoreCache: true });
await sleep(6000);
const emptyState = await ev(`(() => ({
  empty: getComputedStyle(document.querySelector('.map-empty')).display,
  nodes: document.querySelectorAll('.map-node').length,
  routes: document.querySelectorAll('.route').length,
}))()`);
console.log('  空状态:', JSON.stringify(emptyState));
ok(emptyState.empty !== 'none' && emptyState.nodes === 0, '地图为空 + 空状态提示');
await shot('v5_0_empty.png');

// ============ 测试 A：真实操作创建 北京 → 上海 ============
console.log('== 2. 测试 A：真实操作 北京 → 上海 ==');
await ev(`document.querySelector('.map-add-btn').click()`);
await sleep(900);
await ev(`(() => {
  const input = document.querySelector('.form-wrap .field .input');
  input.value = '京沪行';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find(b => b.textContent.includes('添加起点')).click()`);
await sleep(400);
await ev(`(() => {
  const input = document.querySelector('.place-card[data-role="start"] .city-search .input');
  input.value = '北京';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(400);
await ev(`document.querySelector('.place-card[data-role="start"] .city-suggest-item').click()`);
await sleep(300);
await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find(b => b.textContent.includes('添加终点')).click()`);
await sleep(400);
await ev(`(() => {
  const input = document.querySelector('.place-card[data-role="destination"] .city-search .input');
  input.value = '上海';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(400);
await ev(`document.querySelector('.place-card[data-role="destination"] .city-suggest-item').click()`);
await sleep(300);
await shot('v5_1_form.png');
await ev(`document.querySelector('.form-wrap .btn-primary').click()`);

// 保存后立即高频截图 + DOM 断言（celebrate：定位→起点→生长→终点出现）
await sleep(300);
console.log('  --- 生长序列采样 ---');
const samples = [];
for (const t of [0, 400, 800, 1200, 1600, 2000, 2400, 2800]) {
  if (t) await sleep(400);
  const bj = await cityVis('Beijing');
  const sh = await cityVis('Shanghai');
  const prog = await routeProgress();
  const cam = await ev(`document.querySelector('.world').getAttribute('transform')`);
  samples.push({ t, bj: bj.nodeVis, sh: sh.nodeVis, shLabel: sh.labelVis, prog });
  console.log(`  +${t}ms  北京:${bj.nodeVis} 上海:${sh.nodeVis} 上海名:${sh.labelVis} 路线offset:[${prog}] cam:${cam}`);
}
// 关键断言：生长中期上海必须 visibility:hidden（完全不存在），完成后 visible
const midShHidden = samples.slice(0, 4).some((s) => s.sh === 'hidden');
const endShVisible = samples[samples.length - 1].sh === 'visible' || samples[samples.length - 1].sh === 'unset';
ok(midShHidden, '生长前中期：上海完全隐藏（visibility:hidden）');
ok(endShVisible, '抵达后：上海节点出现（visible）');
const endLabelShown = samples[samples.length - 1].shLabel === 'visible' || samples[samples.length - 1].shLabel === 'unset';
ok(endLabelShown, '抵达后：上海城市名出现');
await shot('v5_2_bj_sh_done.png');
const scaleA = await worldScale();
ok(scaleA > 1.5, '保存后自动聚焦京沪区域 scale=' + scaleA);
const toastA = await ev(`document.querySelector('.toast').textContent`);
ok(toastA.includes('旅程已添加') || toastA.includes('Journey added'), 'toast「旅程已添加」');

// ============ 测试 B：北京 → 南京 → 上海 ============
console.log('== 3. 测试 B：真实操作 北京 → 南京 → 上海 ==');
await ev(`document.querySelector('.map-add-btn').click()`);
await sleep(900);
await ev(`(() => {
  const input = document.querySelector('.form-wrap .field .input');
  input.value = '京宁沪';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find(b => b.textContent.includes('添加起点')).click()`);
await sleep(400);
await ev(`(() => {
  const input = document.querySelector('.place-card[data-role="start"] .city-search .input');
  input.value = '北京';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(400);
await ev(`document.querySelector('.place-card[data-role="start"] .city-suggest-item').click()`);
await sleep(300);
await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find(b => b.textContent.includes('添加途经点')).click()`);
await sleep(400);
await ev(`(() => {
  const input = document.querySelector('.place-card[data-role="waypoint"] .city-search .input');
  input.value = '南京';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(400);
await ev(`document.querySelector('.place-card[data-role="waypoint"] .city-suggest-item').click()`);
await sleep(300);
await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find(b => b.textContent.includes('添加终点')).click()`);
await sleep(400);
await ev(`(() => {
  const input = document.querySelector('.place-card[data-role="destination"] .city-search .input');
  input.value = '上海';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await sleep(400);
await ev(`document.querySelector('.place-card[data-role="destination"] .city-suggest-item').click()`);
await sleep(300);
await shot('v5_3_form3.png');
await ev(`document.querySelector('.form-wrap .btn-primary').click()`);

console.log('  --- 三段生长序列采样 ---');
const samplesB = [];
for (const t of [0, 500, 1000, 1500, 2000, 2500, 3000, 3600]) {
  if (t) await sleep(t === 3600 ? 600 : 500);
  const nj = await cityVis('Nanjing');
  const sh = await cityVis('Shanghai');
  const prog = await routeProgress();
  samplesB.push({ t, nj: nj.nodeVis, sh: sh.nodeVis, shLabel: sh.labelVis, prog });
  console.log(`  +${t}ms  南京:${nj.nodeVis} 上海:${sh.nodeVis} 上海名:${sh.labelVis} 路线offset:[${prog}]`);
}
// 南京应先于上海出现；上海在抵达前隐藏
const njFirst = samplesB.findIndex((s) => s.nj === 'visible');
const shFirst = samplesB.findIndex((s) => s.sh === 'visible');
ok(njFirst >= 0 && shFirst >= 0 && njFirst < shFirst, `南京(${njFirst}) 先于 上海(${shFirst}) 出现`);
ok(samplesB.slice(0, 3).some((s) => s.sh === 'hidden'), '生长中期：上海仍完全隐藏');
ok(samplesB[samplesB.length - 1].sh === 'visible', '最终：上海出现');
await shot('v5_4_bj_nj_sh_done.png');

console.log('== EXCEPTIONS: ' + exceptions.length + ' | console errors: ' + errors.length + ' ==');
exceptions.slice(0, 10).forEach((e) => console.log('  ✗', e));
errors.slice(0, 10).forEach((e) => console.log('  ✗', e));
if (exceptions.length || errors.length) exitCode = 1;
console.log(exitCode ? 'V5 FAIL' : 'V5 PASS');
ws.close();
edge.kill();
process.exit(exitCode);
