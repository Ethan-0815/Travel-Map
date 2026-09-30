// v5visual.mjs — 生长动画中期截图（肉眼验收：终点完全不存在 + travel head）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9372;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,TimerThrottlingForBackgroundTabs',
  '--user-data-dir=' + process.env.TEMP + '/edge-v5v-' + Date.now() + '-profile',
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
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  if (s.result?.data) writeFileSync(process.env.TEMP + '/' + name, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
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

// 建 北京 → 南京 → 上海（三段，便于看中间态）
await ev(`document.querySelector('.map-add-btn').click()`);
await sleep(900);
await ev(`(() => {
  const input = document.querySelector('.form-wrap .field .input');
  input.value = '京宁沪';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
const fill = async (role, btn, city) => {
  await ev(`[...document.querySelectorAll('.form-wrap .btn-ghost')].find(b => b.textContent.includes(${JSON.stringify(btn)})).click()`);
  await sleep(400);
  await ev(`(() => {
    const input = document.querySelector('.place-card[data-role="${role}"] .city-search .input');
    input.value = ${JSON.stringify(city)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(400);
  await ev(`document.querySelector('.place-card[data-role="${role}"] .city-suggest-item').click()`);
  await sleep(300);
};
await fill('start', '添加起点', '北京');
await fill('waypoint', '添加途经点', '南京');
await fill('destination', '添加终点', '上海');
await ev(`document.querySelector('.form-wrap .btn-primary').click()`);

// 生长中期截图：北京→南京生长中 / 南京出现上海隐藏 / 南京→上海生长中 / 完成
await sleep(900);
await shot('v5v_1_growing_leg1.png');
await sleep(900);
await shot('v5v_2_nanjing_arrived.png');
await sleep(800);
await shot('v5v_3_growing_leg2.png');
await sleep(1200);
await shot('v5v_4_done.png');
console.log('done');
ws.close();
edge.kill();
process.exit(0);
