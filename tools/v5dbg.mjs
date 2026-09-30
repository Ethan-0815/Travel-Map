// v5dbg.mjs — 追踪 celebrate 后 scale=1 的根因
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9371;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,TimerThrottlingForBackgroundTabs',
  '--user-data-dir=' + process.env.TEMP + '/edge-v5dbg-' + Date.now() + '-profile',
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
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    console.log('  [console]', text);
  }
};
const send = (m, p = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);`,
});
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

// 注入追踪：包装 camera.set 和 fitTo
await ev(`(() => {
  const mp = window.__mapPage = [...document.querySelectorAll('.map-root')].length;
  // 从 DOM 找 mapView：通过事件订阅不可行，直接 patch camera 原型不可行（闭包）。
  // 改从 world transform 采样。
})()`);

// 真实操作建 北京→上海
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

// 保存前 patch：在 tween.js 无法触及，改为高频采样 world transform
const readCam = () => ev(`document.querySelector('.world').getAttribute('transform')`);
console.log('保存前:', await readCam());
await ev(`document.querySelector('.form-wrap .btn-primary').click()`);
for (let i = 0; i < 20; i++) {
  await sleep(250);
  const t = await readCam();
  const hash = await ev(`location.hash`);
  console.log(`+${(i + 1) * 250}ms  ${t}  ${hash}`);
}
ws.close();
edge.kill();
process.exit(0);
