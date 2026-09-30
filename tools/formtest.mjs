// formtest.mjs — 测试三段式 Add Journey 表单（起点/途经点/终点）+ 城市搜索 + 持久化 + 导出
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9337;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + process.env.TEMP + '/edge-form-' + Date.now() + '-profile',
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
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
await sleep(4200);
// 清空数据，确保干净起点
await send('Runtime.evaluate', { expression: `(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  for (const s of ['journeys','places','photos','blobs','settings']) await new Promise((res) => { const rq = db.transaction(s,'readwrite').objectStore(s).clear(); rq.onsuccess = res; });
  db.close();
})()`, awaitPromise: true });
await send('Page.reload', { ignoreCache: true });
await sleep(8500);

const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  if (s.result?.data) writeFileSync(process.env.TEMP + '/' + name, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};

console.log('== 1. 打开 Add Journey（三段式） ==');
await ev(`location.hash = '#/journey/new'`);
await sleep(800);

// 填写旅程名
await ev(`(() => {
  const input = document.querySelector('.form-wrap .field .input');
  input.value = 'Sichuan Trip';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);

// 添加起点：成都
await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find(b => b.textContent.includes('添加起点') || b.textContent.includes('Add start')).click()`);
await sleep(400);
await ev(`(() => {
  const card = document.querySelector('.place-card[data-role="start"]');
  const input = card.querySelector('.city-search .input');
  input.value = '成都';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(400);
const sugStart = await ev(`(() => {
  const item = document.querySelector('.place-card[data-role="start"] .city-suggest-item');
  return item ? item.textContent : null;
})()`);
await ev(`document.querySelector('.place-card[data-role="start"] .city-suggest-item')?.click()`);
await sleep(400);
const startCoords = await ev(`(() => {
  const card = document.querySelector('.place-card[data-role="start"]');
  const nums = card.querySelectorAll('.place-card-row .input');
  return { lat: nums[1]?.value, lng: nums[2]?.value };
})()`);
console.log('起点「成都」建议:', JSON.stringify(sugStart), '| 坐标自动填充:', JSON.stringify(startCoords));

// 添加终点：北京
await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find(b => b.textContent.includes('添加终点') || b.textContent.includes('Add destination')).click()`);
await sleep(400);
await ev(`(() => {
  const card = document.querySelector('.place-card[data-role="destination"]');
  const input = card.querySelector('.city-search .input');
  input.value = '北京';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(400);
await ev(`document.querySelector('.place-card[data-role="destination"] .city-suggest-item')?.click()`);
await sleep(400);
await shot('form_1_filled.png');

console.log('== 2. 保存 ==');
await ev(`document.querySelector('.form-wrap .btn-primary').click()`);
await sleep(2500);
const hash = await ev(`location.hash`);
const journeys = await ev(`(async function(){
  const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const js = await new Promise((res) => { const rq = db.transaction('journeys').objectStore('journeys').getAll(); rq.onsuccess = () => res(rq.result); });
  const rows = await new Promise((res) => { const rq = db.transaction('places').objectStore('places').getAll(); rq.onsuccess = () => res(rq.result); });
  db.close();
  const j = js.find(x => x.title === 'Sichuan Trip');
  if (!j) return null;
  return rows.filter(p => p.journeyId === j.id).sort((a,b) => a.seq - b.seq).map(p => ({ name: p.name, role: p.role, lat: p.lat, lng: p.lng }));
})()`);
console.log('hash:', hash, '| saved:', JSON.stringify(journeys));

console.log('== 3. 导出/导入 ==');
const exportOk = await ev(`(async function(){
  const m = await import('./js/data/backup.js');
  const json = await m.exportBackup();
  const data = JSON.parse(json);
  return { journeys: data.journeys.length, places: data.places.length, hasBlobs: Array.isArray(data.blobs) };
})()`);
console.log('export:', JSON.stringify(exportOk));

console.log('== EXCEPTIONS: ' + exceptions.length + ' ==');
exceptions.slice(0, 8).forEach((e) => console.log('  ✗', e));
console.log(exceptions.length === 0 ? 'FORM PASS' : 'FORM FAIL');
ws.close();
edge.kill();
process.exit(exceptions.length === 0 ? 0 : 1);
