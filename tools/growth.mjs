// growth.mjs — 验证首页路线生长动画序列（分时段采样 dashoffset + 节点可见性）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9340;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + process.env.TEMP + '/edge-growth-profile',
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
  if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.text);
};
const send = (m, p = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
await sleep(600); // 等 init 完成，捕获淡入后、生长前

const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

const sample = async (label) => {
  const s = await ev(`(function(){
    const lines = [...document.querySelectorAll('.route path')].filter(p => p.getAttribute('stroke-dashoffset') !== null);
    const drawn = lines.filter(p => parseFloat(p.getAttribute('stroke-dashoffset')) < 0.5).length;
    const visibleNodes = [...document.querySelectorAll('.map-node')].filter(n => parseFloat(getComputedStyle(n).opacity) > 0.5).length;
    const totalNodes = document.querySelectorAll('.map-node').length;
    const statsShown = !!document.querySelector('.map-stats.is-show');
    return { drawn, totalLines: lines.length, visibleNodes, totalNodes, statsShown };
  })()`);
  console.log(label, JSON.stringify(s));
  return s;
};

await sample('t0 (淡入完成, 生长前)');
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(process.env.TEMP + '/' + name, Buffer.from(s.result.data, 'base64'));
};
await shot('growth_1_start.png');
await sleep(1800);
await sample('t1.8s (第一段旅程生长中)');
await shot('growth_2_mid.png');
await sleep(2200);
await sample('t4s');
await shot('growth_3.png');
await sleep(2500);
await sample('t6.5s (应全部完成)');
await shot('growth_4_done.png');

console.log('EXCEPTIONS:', exceptions.length);
exceptions.forEach((e) => console.log('  ✗', e));
ws.close();
edge.kill();
process.exit(exceptions.length === 0 ? 0 : 1);
