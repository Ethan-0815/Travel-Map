// dashzoom2.mjs — Replay 后局部放大截图验证路线是否连续
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { clearWithRetry, SEED_EXPR, RAF_SHIM_SOURCE } from './seedTestData.mjs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9374;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-features=IntensiveWakeUpThrottling',
  '--user-data-dir=' + process.env.TEMP + '/edge-dz2-' + Date.now() + '-profile',
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
await send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_SHIM_SOURCE });
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
await sleep(4000);
await clearWithRetry(ev, sleep);
await ev(SEED_EXPR);
await send('Page.reload', { ignoreCache: true });
await sleep(9000);

// 读路线状态 + 截北京-上海段局部放大
const info = await ev(`(() => {
  const lines = [...document.querySelectorAll('.route path')];
  return lines.map((p) => ({
    da: p.getAttribute('stroke-dasharray'),
    do: p.getAttribute('stroke-dashoffset'),
    len: Math.round(p.getTotalLength()),
  }));
})()`);
console.log('routes:', JSON.stringify(info));

// 找北京-上海段的 bbox
const rect = await ev(`(() => {
  const paths = [...document.querySelectorAll('.route path')];
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const p of paths) {
    const b = p.getBBox();
    const r = p.getBoundingClientRect();
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: Math.max(0, minX - 40), y: Math.max(0, minY - 40), width: Math.min(1440, maxX - minX + 80), height: Math.min(900, maxY - minY + 80) };
})()`);
console.log('clip:', JSON.stringify(rect));
const s = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 } });
if (s.result?.data) writeFileSync(process.env.TEMP + '/dash_zoom2.png', Buffer.from(s.result.data, 'base64'));
console.log('shot: dash_zoom2.png');
ws.close();
edge.kill();
process.exit(0);
