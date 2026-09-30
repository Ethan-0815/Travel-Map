// mobile.mjs — 移动端视口截图（注入标准测试数据；Demo 已移除）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { clearWithRetry, SEED_EXPR, RAF_SHIM_SOURCE } from './seedTestData.mjs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9338;
const W = 390, H = 844;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,TimerThrottlingForBackgroundTabs',
  '--user-data-dir=' + process.env.TEMP + '/edge-mobile-' + Date.now() + '-profile',
  `--window-size=${W},${H}`, 'about:blank',
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
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (m, p = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_SHIM_SOURCE });
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
await sleep(4000);
await clearWithRetry(ev, sleep);
await ev(SEED_EXPR);
await send('Page.reload', { ignoreCache: true });
await sleep(8500);
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(process.env.TEMP + '/' + name, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};
await shot('mobile_1_map.png');
// 点击一个城市看底部 sheet
await send('Runtime.evaluate', { expression: `document.querySelectorAll('.map-node')[0].dispatchEvent(new MouseEvent('click',{bubbles:true}))` });
await sleep(1300);
await shot('mobile_2_detail.png');
await send('Runtime.evaluate', { expression: `document.querySelector('.detail-close')?.click()` });
await sleep(500);
await send('Runtime.evaluate', { expression: `location.hash = '#/stats'` });
await sleep(1200);
await shot('mobile_3_stats.png');
ws.close();
edge.kill();
process.exit(0);
