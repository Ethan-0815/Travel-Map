// v3test.mjs — 第三轮测试：Start/Waypoint/Destination + 去 Demo + 自动聚焦 + Count-up
// 注意：动画断言必须在 Page.reload 之前完成（无头 reload 会导致 rAF 停摆）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9345;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,TimerThrottlingForBackgroundTabs',
  '--user-data-dir=' + process.env.TEMP + '/edge-v3-' + Date.now() + '-profile',
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
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    throw new Error('eval failed: ' + d.text + ' ' + (d.exception?.description || ''));
  }
  return r.result?.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  if (s.result?.data) writeFileSync(process.env.TEMP + '/' + name, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};

const fetchJourney = (title) => ev(`(async function(){
  const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const js = await new Promise((res) => { const rq = db.transaction('journeys').objectStore('journeys').getAll(); rq.onsuccess = () => res(rq.result); });
  const ps = await new Promise((res) => { const rq = db.transaction('places').objectStore('places').getAll(); rq.onsuccess = () => res(rq.result); });
  db.close();
  const j = js.find((x) => x.title === ${JSON.stringify('__T__')});
  if (!j) return null;
  return ps.filter((p) => p.journeyId === j.id).sort((a, b) => a.seq - b.seq).map((p) => ({ name: p.name, role: p.role, seq: p.seq }));
})()`.replace(JSON.stringify('__T__'), JSON.stringify(title)));

const worldScale = () => ev(`(() => {
  const t = document.querySelector('.world').getAttribute('transform') || '';
  const m = /scale\\(([\\d.]+)\\)/.exec(t);
  return m ? parseFloat(m[1]) : null;
})()`);
const nums = () => ev(`[...document.querySelectorAll('.map-stats .num')].map(n => n.textContent)`);

const clickFormBtn = (text) => ev(`(() => {
  const btn = [...document.querySelectorAll('.form-wrap .btn-ghost')].find((b) => b.textContent.includes(${JSON.stringify(text)}));
  if (!btn) return false;
  btn.click();
  return true;
})()`);
const fillPlace = (wrapIdx, index, city) => ev(`(() => {
  const wrap = document.querySelectorAll('.form-wrap .place-editor')[${wrapIdx}];
  const inputs = wrap.querySelectorAll('.city-search .input');
  const input = inputs[${index}];
  input.value = ${JSON.stringify(city)};
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const pickSuggestion = () => ev(`(() => {
  const lists = [...document.querySelectorAll('.city-suggest')].filter((s) => s.style.display !== 'none');
  const item = lists.length ? lists[lists.length - 1].querySelector('.city-suggest-item') : null;
  if (!item) return false;
  item.click();
  return true;
})()`);
const fillName = (name) => ev(`(() => {
  const input = document.querySelector('.form-wrap .field .input');
  input.value = ${JSON.stringify(name)};
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
const saveForm = () => ev(`(() => { const b = document.querySelector('.form-wrap .btn-primary'); b.click(); return true; })()`);

const results = [];
const ok = (label, cond, extra = '') => { results.push({ label, cond }); console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : '')); };

let lastToastSeen = false;
async function addJourney(title, cities) {
  await ev(`document.querySelector('.map-add-btn').click()`);
  await sleep(800);
  await fillName(title);
  await clickFormBtn('添加起点');
  await sleep(300); await fillPlace(0, 0, cities[0]); await sleep(300); await pickSuggestion(); await sleep(300);
  for (let i = 1; i < cities.length - 1; i++) {
    await clickFormBtn('添加途经点');
    await sleep(300); await fillPlace(1, i - 1, cities[i]); await sleep(300); await pickSuggestion(); await sleep(300);
  }
  await clickFormBtn('添加终点');
  await sleep(300); await fillPlace(2, 0, cities[cities.length - 1]); await sleep(300); await pickSuggestion(); await sleep(300);
  await saveForm();
  // 保存后立即轮询 toast（庆祝动画 ~2.5s 后出现，2.2s 后消失）
  lastToastSeen = false;
  for (let i = 0; i < 25; i++) {
    const t = await ev(`(() => { const el = document.querySelector('.toast'); return el ? { shown: el.classList.contains('is-show'), text: el.textContent } : null; })()`);
    if (t && t.shown && (t.text.includes('旅程已添加') || t.text.includes('Journey added'))) { lastToastSeen = true; break; }
    await sleep(300);
  }
  await sleep(1500);
}

await send('Runtime.enable');
await send('Page.enable');
// rAF shim 提前注入（app 启动前），规避无头帧调度停摆
const { SEED_EXPR, RAF_SHIM_SOURCE } = await import('./seedTestData.mjs');
await send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_SHIM_SOURCE });
// 首次导航后清理 IndexedDB + 注入标准测试数据（Demo 已移除，测试数据显式注入）
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
await ev(SEED_EXPR);
await send('Page.reload', { ignoreCache: true });
await sleep(9000);
// 触发一次 rAF 让进入动画（若有卡顿）走完
await Promise.race([ev(`new Promise((r) => requestAnimationFrame(() => r(1)))`), sleep(500)]);

console.log('== 初始（Demo + 自动聚焦 + 无体验演示 + Count-up） ==');
ok('无体验演示', await ev(`!document.querySelector('.demo-banner') && !document.body.textContent.includes('体验演示')`));
ok('空状态隐藏', await ev(`getComputedStyle(document.querySelector('.map-empty')).display === 'none'`));
const initScale = await worldScale();
ok('首次进入自动聚焦（scale > 1）', initScale !== null && initScale > 1.0, 'scale=' + initScale);
ok('首次统计 Count-up 完成（7/5）', JSON.stringify(await nums()) === '["7","5"]', JSON.stringify(await nums()));

console.log('== 测试 A：创建 上海 → 北京 ==');
await addJourney('Silk Route', ['上海', '北京']);
const placesA = await fetchJourney('Silk Route');
ok('上海 Start、北京 Destination', JSON.stringify(placesA) === '[{"name":"Shanghai","role":"start","seq":0},{"name":"Beijing","role":"destination","seq":1}]', JSON.stringify(placesA));
const scaleA = await worldScale();
ok('保存后自动聚焦（scale > 1.5）', scaleA !== null && scaleA > 1.5, 'scale=' + scaleA);
ok('toast 旅程已添加', lastToastSeen);

console.log('== 测试 B：创建 上海 → 南京 → 北京 ==');
await addJourney('East China Loop', ['上海', '南京', '北京']);
const placesB = await fetchJourney('East China Loop');
ok('顺序 start → waypoint → destination', JSON.stringify(placesB) === '[{"name":"Shanghai","role":"start","seq":0},{"name":"Nanjing","role":"waypoint","seq":1},{"name":"Beijing","role":"destination","seq":2}]', JSON.stringify(placesB));

console.log('== 测试 C：重新进入地图自动聚焦 ==');
await ev(`location.hash = '#/journeys'`);
await sleep(700);
await ev(`location.hash = '#/'`);
await sleep(2200);
const scaleC = await worldScale();
ok('重新进入自动聚焦（scale > 1.5）', scaleC !== null && scaleC > 1.5, 'scale=' + scaleC);

console.log('== 测试 D：每次进入地图 Count-up ==');
await ev(`location.hash = '#/stats'`);
await sleep(500);
await ev(`location.hash = '#/'`);
// rAF 探针：确认 tween 引擎是否还能推进
const rafD = await Promise.race([
  ev(`new Promise((res) => requestAnimationFrame(() => res('fired')))`),
  new Promise((res) => setTimeout(() => res('STOPPED'), 1500)),
]);
console.log('  [探针] 测试 D 处 rAF:', rafD);
// count-up 需 rAF 推进（无头环境可能停摆），轮询等待最终值
let numsD = null;
for (let i = 0; i < 15; i++) {
  await sleep(400);
  numsD = await nums();
  if (JSON.stringify(numsD) === '["8","5"]') break;
}
ok('Count-up 最终稳定（8 城市 / 5 国家）', JSON.stringify(numsD) === '["8","5"]', JSON.stringify(numsD));

console.log('== 测试 E：清空数据 → 世界视角 + 空状态 ==');
await ev(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  for (const s of ['journeys','places','photos','blobs']) await new Promise((res) => { const rq = db.transaction(s,'readwrite').objectStore(s).clear(); rq.onsuccess = res; });
  db.close();
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(9000);
ok('空状态显示', await ev(`getComputedStyle(document.querySelector('.map-empty')).display === 'flex'`));
ok('空状态文案', await ev(`(document.querySelector('.map-empty-title').textContent.includes('第一段旅程') || document.querySelector('.map-empty-title').textContent.includes('first journey'))`));
ok('仍无体验演示', await ev(`!document.body.textContent.includes('体验演示') && !document.querySelector('.demo-banner')`));
const emptyScale = await worldScale();
ok('空数据世界视角（scale < 1.2）', emptyScale !== null && emptyScale < 1.2, 'scale=' + emptyScale);
await shot('v3_empty_final.png');

console.log('== EXCEPTIONS: ' + exceptions.length + ' | console errors: ' + errors.length + ' ==');
[...exceptions, ...errors].slice(0, 10).forEach((e) => console.log('  ✗', e));
const passed = results.filter((r) => r.cond).length;
console.log(`== 结果: ${passed}/${results.length} 通过 ==`);
ws.close();
edge.kill();
process.exit(exceptions.length === 0 && errors.length === 0 && passed === results.length ? 0 : 1);
