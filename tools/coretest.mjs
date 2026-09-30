// coretest.mjs — 核心体验流程测试：FAB → 表单（城市搜索）→ 保存反馈 → 生长重放
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + process.env.TEMP + '/edge-core6-profile',
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
const consoleMsgs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    exceptions.push(d.text + ' ' + (d.exception?.description || ''));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleMsgs.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
  }
};
const send = (m, p = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });

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
  if (s.result?.data) {
    const fs = await import('node:fs');
    fs.writeFileSync(process.env.TEMP + '/' + name, Buffer.from(s.result.data, 'base64'));
  }
  console.log('shot:', name);
};

// 读取 IndexedDB 中指定旅程的地点（按 seq 排序）
async function fetchJourney(title) {
  return ev(`(async function(){
    const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const js = await new Promise((res) => { const rq = db.transaction('journeys').objectStore('journeys').getAll(); rq.onsuccess = () => res(rq.result); });
    const ps = await new Promise((res) => { const rq = db.transaction('places').objectStore('places').getAll(); rq.onsuccess = () => res(rq.result); });
    db.close();
    const j = js.find((x) => x.title === ${JSON.stringify(title)});
    if (!j) return null;
    return ps.filter((p) => p.journeyId === j.id).sort((a, b) => a.seq - b.seq).map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, country: p.country }));
  })()`);
}

// 等首页进入动画完成
await sleep(7500);

// ============ 场景 1：上海 → 北京（两城） ============
console.log('== 场景1: 上海 → 北京 ==');
await ev(`document.querySelector('.map-add-btn').click()`);
await sleep(800);
await ev(`(() => {
  const name = document.querySelector('.form-wrap .field .input');
  name.value = 'Silk Route';
  name.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
for (const city of ['上海', '北京']) {
  await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find((b) => b.textContent.includes('添加地点')).click()`);
  await sleep(350);
  await ev(`(() => {
    const cards = document.querySelectorAll('.place-card');
    const input = cards[cards.length - 1].querySelector('.city-search .input');
    input.value = ${JSON.stringify(city)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(350);
  const sug = await ev(`(() => {
    const lists = [...document.querySelectorAll('.city-suggest')].filter((s) => s.style.display !== 'none');
    const item = lists.length && lists[lists.length - 1].querySelector('.city-suggest-item');
    return item ? item.textContent : null;
  })()`);
  console.log(`  搜索「${city}」建议:`, sug);
  await ev(`(() => {
    const lists = [...document.querySelectorAll('.city-suggest')].filter((s) => s.style.display !== 'none');
    lists[lists.length - 1].querySelector('.city-suggest-item').click();
  })()`);
  await sleep(350);
}
await ev(`[...document.querySelectorAll('.form-wrap .btn-primary')].forEach((b) => b.click())`);
await sleep(4200);
const hash1 = await ev(`location.hash`);
const toast1 = await ev(`(() => { const t = document.querySelector('.toast'); return { text: t.textContent, shown: t.classList.contains('is-show') }; })()`);
const stats1 = await ev(`[...document.querySelectorAll('.map-stats .num')].map((n) => n.textContent)`);
const route1 = await ev(`(() => {
  const groups = [...document.querySelectorAll('.route')].map((g) => {
    const paths = [...g.querySelectorAll('path')].map((p) => {
      const off = p.getAttribute('stroke-dashoffset');
      return off === null ? 'none' : parseFloat(off).toFixed(2);
    });
    return paths;
  });
  return groups;
})()`);
const places1 = await fetchJourney('Silk Route');
console.log('  持久化地点:', JSON.stringify(places1));
console.log('  hash:', hash1, '| toast:', JSON.stringify(toast1), '| stats:', JSON.stringify(stats1), '| 路线分组 dashoffset:', JSON.stringify(route1));
await shot('core_1_shanghai_beijing.png');

// ============ 场景 2：上海 → 南京 → 北京（三城，顺序生长） ============
console.log('== 场景2: 上海 → 南京 → 北京 ==');
await ev(`document.querySelector('.map-add-btn').click()`);
await sleep(800);
await ev(`(() => {
  const name = document.querySelector('.form-wrap .field .input');
  name.value = 'East China Loop';
  name.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
for (const city of ['上海', '南京', '北京']) {
  await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find((b) => b.textContent.includes('添加地点')).click()`);
  await sleep(350);
  await ev(`(() => {
    const cards = document.querySelectorAll('.place-card');
    const input = cards[cards.length - 1].querySelector('.city-search .input');
    input.value = ${JSON.stringify(city)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(350);
  const sug = await ev(`(() => {
    const lists = [...document.querySelectorAll('.city-suggest')].filter((s) => s.style.display !== 'none');
    const item = lists.length && lists[lists.length - 1].querySelector('.city-suggest-item');
    return item ? item.textContent : null;
  })()`);
  console.log(`  搜索「${city}」建议:`, sug);
  await ev(`(() => {
    const lists = [...document.querySelectorAll('.city-suggest')].filter((s) => s.style.display !== 'none');
    lists[lists.length - 1].querySelector('.city-suggest-item').click();
  })()`);
  await sleep(350);
}
await ev(`[...document.querySelectorAll('.form-wrap .btn-primary')].forEach((b) => b.click())`);
// 生长过程采样（只看最新一条旅程的路线 = 最后一个 .route 组）
const sampleLast = () => ev(`(() => {
  const groups = [...document.querySelectorAll('.route')];
  const g = groups[groups.length - 1];
  if (!g) return null;
  const lines = [...g.querySelectorAll('path')].filter((p) => p.getAttribute('stroke-dashoffset') !== null);
  return lines.map((p) => parseFloat(p.getAttribute('stroke-dashoffset')).toFixed(2));
})()`);
await sleep(500);
console.log('  +0.5s 最新路线 dashoffset:', JSON.stringify(await sampleLast()));
await shot('core_2_growing.png');
await sleep(700);
console.log('  +1.2s 最新路线 dashoffset:', JSON.stringify(await sampleLast()));
await sleep(1200);
console.log('  +2.4s 最新路线 dashoffset:', JSON.stringify(await sampleLast()));
await shot('core_3_done.png');
await sleep(2500);
const toast2 = await ev(`(() => { const t = document.querySelector('.toast'); return { text: t.textContent, shown: t.classList.contains('is-show') }; })()`);
const stats2 = await ev(`[...document.querySelectorAll('.map-stats .num')].map((n) => n.textContent)`);
const journeyCount = await ev(`document.querySelectorAll('.route').length`);
const places2 = await fetchJourney('East China Loop');
console.log('  toast:', JSON.stringify(toast2), '| stats:', JSON.stringify(stats2), '| journeys:', journeyCount);
console.log('  持久化地点:', JSON.stringify(places2));

console.log('== EXCEPTIONS: ' + exceptions.length + ' | console errors: ' + consoleMsgs.length + ' ==');
[...exceptions, ...consoleMsgs].slice(0, 10).forEach((e) => console.log('  ✗', e));
ws.close();
edge.kill();
process.exit(exceptions.length === 0 && consoleMsgs.length === 0 ? 0 : 1);
