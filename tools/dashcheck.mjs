// dashcheck.mjs — 建数据后检查路线 dash 渲染 + 局部放大截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9373;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,TimerThrottlingForBackgroundTabs',
  '--user-data-dir=' + process.env.TEMP + '/edge-dash-' + Date.now() + '-profile',
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
};
const send = (m, p = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
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

// 直接注入一条 北京→上海 旅程（免去表单操作）
await ev(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction(['journeys','places'],'readwrite');
  const jid = 'j1';
  tx.objectStore('journeys').put({ id: jid, title: 'BJ-SH', subtitle: '', startDate: '2025-05-01', endDate: '2025-05-05', description: '', coverColor: '#e09b57', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const ps = tx.objectStore('places');
  ps.put({ id: 'p1', journeyId: jid, name: 'Beijing', city: 'Beijing', country: 'China', lat: 39.9042, lng: 116.4074, arriveAt: '2025-05-01T09:00', departAt: null, note: '', photoIds: [], seq: 0, role: 'start' });
  ps.put({ id: 'p2', journeyId: jid, name: 'Shanghai', city: 'Shanghai', country: 'China', lat: 31.2304, lng: 121.4737, arriveAt: '2025-05-03T09:00', departAt: null, note: '', photoIds: [], seq: 1, role: 'destination' });
  await new Promise((res) => { tx.oncomplete = res; });
  db.close();
  location.reload();
})()`);
await sleep(7000);

const info = await ev(`(() => {
  const lines = [...document.querySelectorAll('.route path')];
  return {
    lineCount: lines.length,
    sample: lines.map((p) => ({
      dasharray: p.getAttribute('stroke-dasharray'),
      dashoffset: p.getAttribute('stroke-dashoffset'),
      pathLengthAttr: p.getAttribute('pathLength'),
      totalLen: Math.round(p.getTotalLength() * 100) / 100,
      width: p.style.strokeWidth || getComputedStyle(p).strokeWidth,
    })),
  };
})()`);
console.log(JSON.stringify(info, null, 2));

// 局部放大截图：北京-上海区域
const rect = await ev(`(() => {
  const g = document.querySelector('.route');
  const b = g.getBoundingClientRect();
  return { x: Math.max(0, b.x - 60), y: Math.max(0, b.y - 60), width: b.width + 120, height: b.height + 120 };
})()`);
console.log('clip:', JSON.stringify(rect));
const s = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 } });
if (s.result?.data) writeFileSync(process.env.TEMP + '/dash_zoom.png', Buffer.from(s.result.data, 'base64'));
console.log('shot: dash_zoom.png');
ws.close();
edge.kill();
process.exit(0);
