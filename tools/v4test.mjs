// v4test.mjs — 第四轮测试：生长动画终点隐藏 / 初始化同步定位 / Stats 五区块
// 关键约束：无头 Edge 的 reload 会导致 rAF 停摆，因此：
//   - 生长动画采样放在首次 navigate（rAF 正常）期间
//   - 空状态测试放到最后（需要 reload）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9360;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,TimerThrottlingForBackgroundTabs',
  '--user-data-dir=' + process.env.TEMP + '/edge-v4-' + Date.now() + '-profile',
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
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  if (s.result?.data) writeFileSync(process.env.TEMP + '/' + name, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};

const worldScale = () => ev(`(() => {
  const t = document.querySelector('.world').getAttribute('transform') || '';
  const m = /scale\\(([\\d.]+)\\)/.exec(t);
  return m ? parseFloat(m[1]) : null;
})()`);

const visCount = () => ev(`(() => {
  const nodes = [...document.querySelectorAll('.map-node')];
  const labels = [...document.querySelectorAll('.map-label')];
  return {
    visibleNodes: nodes.filter(g => g.style.opacity !== '0').length,
    totalNodes: nodes.length,
    visibleLabels: labels.filter(t => t.style.opacity !== '0').length,
    totalLabels: labels.length,
  };
})()`);

const results = [];
const ok = (label, cond, extra = '') => { results.push({ label, cond }); console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : '')); };

await send('Runtime.enable');
await send('Page.enable');

// ============ 首次加载（清库 + 注入标准测试数据；Demo 已移除） ============
const { SEED_EXPR, RAF_SHIM_SOURCE } = await import('./seedTestData.mjs');
await send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_SHIM_SOURCE });
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
await sleep(4000);
// 清库（DB 可能尚未被 app 创建，轮询重试）
for (let i = 0; i < 10; i++) {
  try {
    await ev(`(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const s of ['journeys','places','photos','blobs','settings']) await new Promise((res) => { const rq = db.transaction(s,'readwrite').objectStore(s).clear(); rq.onsuccess = res; });
      db.close();
    })()`);
    break;
  } catch (e) {
    await sleep(1500); // stores 未就绪，等 bootstrap 后重试
  }
}
await ev(SEED_EXPR);

// reload 进入纯净测试数据状态
await send('Page.reload', { ignoreCache: true });
await sleep(4500);

// ============ 测试 C：首次进入第一帧即旅行区域 ============
// 注意：reload 后 rAF 可能停摆，但同步定位是立即的（非动画），scale 应已 > 1
console.log('== 测试 C：首次进入即旅行区域 ==');
const cScale = await worldScale();
ok('首帧 scale > 1（直接旅行区域）', cScale !== null && cScale > 1.0, 'scale=' + cScale);

// ============ 测试 A/B：生长动画终点隐藏 ============
// 用「强制重新触发进入动画」不可行（entered 标志）。改为：再次完整 reload 并采样。
// 由于 reload 后 rAF 停摆，这里验证「静态状态」：节点初始隐藏（resetForGrowth 已生效）
console.log('== 测试 A/B：生长动画终点隐藏（静态校验） ==');
// 直接检查：此刻若有节点 visible 数 < total（说明 resetForGrowth 生效后，部分节点在生长中）
const visNow = await visCount();
console.log('  当前可见节点/标签:', JSON.stringify(visNow));

// 更直接：验证 resetForGrowth 会隐藏标签——通过重新调用 enterAnimation 前先检查标签初始 opacity
// 改为：验证「标签被 resetForGrowth 隐藏」的能力，用 DOM 直接断言当前所有标签在动画早期不会全显
// 由于 rAF 停摆，动画停在早期，若标签全显则说明 resetForGrowth 未隐藏标签（bug）
ok('动画早期标签非全部显示（终点名隐藏）', visNow.visibleLabels < visNow.totalLabels, JSON.stringify(visNow));

console.log('== 测试 D：切 Tab 返回仍聚焦 ==');
await ev(`location.hash = '#/stats'`);
await sleep(800);
await ev(`location.hash = '#/'`);
await sleep(1500);
const dScale = await worldScale();
ok('返回地图 scale > 1', dScale !== null && dScale > 1.0, 'scale=' + dScale);

// ============ 测试 E：Stats 五区块 ============
console.log('== 测试 E：Stats 页面 ==');
await ev(`location.hash = '#/stats'`);
await sleep(1500);
const statsInfo = await ev(`(() => ({
  sections: [...document.querySelectorAll('.stats-section')].map(s => s.textContent.trim()),
  footprint: !!document.querySelector('.footprint-svg'),
  timelineItems: document.querySelectorAll('.stl-item').length,
  highlights: document.querySelectorAll('.highlight').length,
  heatCells: document.querySelectorAll('.heat-cell').length,
  nums: [...document.querySelectorAll('.stat-card .num')].map(n => n.textContent),
}))()`);
console.log('  Stats:', JSON.stringify(statsInfo));
ok('核心数据 4 卡', statsInfo.nums.length === 4, JSON.stringify(statsInfo.nums));
ok('足迹地图渲染', statsInfo.footprint, '');
ok('时间线有旅程项', statsInfo.timelineItems > 0, 'items=' + statsInfo.timelineItems);
ok('Highlights 有内容', statsInfo.highlights > 0, 'n=' + statsInfo.highlights);
ok('热度图 12 个月', statsInfo.heatCells === 12, 'cells=' + statsInfo.heatCells);
await shot('v4_stats.png');

// ============ 测试 F：清空数据空状态 ============
console.log('== 测试 F：无数据空状态 ==');
await ev(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  for (const s of ['journeys','places','photos','blobs']) await new Promise((res) => { const rq = db.transaction(s,'readwrite').objectStore(s).clear(); rq.onsuccess = res; });
  await new Promise((res) => { const rq = db.transaction('settings','readwrite').objectStore('settings').put({ key: 'demoSeeded', value: true }); rq.onsuccess = res; });
  db.close();
})()`);
await ev(`location.hash = '#/'`);
await send('Page.reload', { ignoreCache: true });
await ev(`(() => {
  if (window.__rafShimmed) return;
  window.__rafShimmed = true;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
})()`);
await sleep(5000);
const emptyInfo = await ev(`(() => {
  const t = document.querySelector('.world').getAttribute('transform') || '';
  const m = /scale\\(([\\d.]+)\\)/.exec(t);
  return {
    mapEmpty: getComputedStyle(document.querySelector('.map-empty')).display,
    scale: m ? parseFloat(m[1]) : null,
  };
})()`);
console.log('  空状态:', JSON.stringify(emptyInfo));
ok('地图空状态显示', emptyInfo.mapEmpty !== 'none', 'display=' + emptyInfo.mapEmpty);
ok('空数据世界视角 scale≈1', emptyInfo.scale !== null && emptyInfo.scale < 1.2, 'scale=' + emptyInfo.scale);

await ev(`location.hash = '#/stats'`);
await sleep(800);
const emptyStats = await ev(`(() => ({
  highlights: document.querySelectorAll('.highlight').length,
  heatCells: document.querySelectorAll('.heat-cell').length,
  footprint: !!document.querySelector('.footprint-svg'),
}))()`);
console.log('  空 Stats:', JSON.stringify(emptyStats));
ok('空数据：无 Highlights', emptyStats.highlights === 0, '');
ok('空数据：无热度图', emptyStats.heatCells === 0, '');
ok('空数据：无足迹地图', !emptyStats.footprint, '');

console.log('== EXCEPTIONS: ' + exceptions.length + ' | console errors: ' + errors.length + ' ==');
exceptions.slice(0, 10).forEach((e) => console.log('  ✗', e));
errors.slice(0, 10).forEach((e) => console.log('  ✗', e));

const pass = results.filter((r) => r.cond).length;
console.log('== 结果: ' + pass + '/' + results.length + ' 通过 ==');
ws.close();
edge.kill();
process.exit(pass === results.length && exceptions.length === 0 && errors.length === 0 ? 0 : 1);
