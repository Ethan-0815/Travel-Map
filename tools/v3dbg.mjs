// v3dbg.mjs — 诊断 v3test 首次聚焦失败
import { spawn } from 'node:child_process';
import { clearWithRetry, SEED_EXPR, RAF_SHIM_SOURCE } from './seedTestData.mjs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9375;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-features=IntensiveWakeUpThrottling',
  '--user-data-dir=' + process.env.TEMP + '/edge-v3dbg-' + Date.now() + '-profile',
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
  if (msg.method === 'Runtime.consoleAPICalled') {
    console.log('  [console]', (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
  }
};
const send = (m, p = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''));
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_SHIM_SOURCE });
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
await sleep(4000);
await clearWithRetry(ev, sleep);
await ev(SEED_EXPR);
console.log('注入完成');
await send('Page.reload', { ignoreCache: true });

// 高频采样 reload 后的状态
for (const t of [1500, 3000, 5000, 7000, 9000]) {
  await sleep(t === 1500 ? 1500 : 2000);
  const info = await ev(`(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const js = await new Promise((res) => { const rq = db.transaction('journeys').objectStore('journeys').getAll(); rq.onsuccess = () => res(rq.result); });
    const ps = await new Promise((res) => { const rq = db.transaction('places').objectStore('places').getAll(); rq.onsuccess = () => res(rq.result); });
    db.close();
    const w = document.querySelector('.world');
    return {
      journeys: js.length,
      places: ps.length,
      roles: ps.map((p) => p.role),
      transform: w ? w.getAttribute('transform') : 'no-world',
      nodes: document.querySelectorAll('.map-node').length,
      mapSvg: !!document.querySelector('.map-svg'),
    };
  })()`);
  console.log(`+${t}ms`, JSON.stringify(info));
}
console.log('exceptions:', exceptions.slice(0, 5));
ws.close();
edge.kill();
process.exit(0);
