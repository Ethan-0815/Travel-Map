// e2e.mjs — 端到端交互测试：点击城市 / 各视图切换 / Replay
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { clearWithRetry, SEED_EXPR, RAF_SHIM_SOURCE } from './seedTestData.mjs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9335;
const url = process.argv[2] || 'http://127.0.0.1:8123/';
const outDir = process.env.TEMP;

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,TimerThrottlingForBackgroundTabs',
  '--user-data-dir=' + process.env.TEMP + '/edge-e2e-' + Date.now() + '-profile',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(300);
  }
  throw new Error('no target');
}
const target = await getTarget();
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
function send(method, params = {}) {
  return new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
await send('Runtime.enable');
await send('Page.enable');
// rAF shim 提前注入（app 启动前），规避无头帧调度停摆
await send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_SHIM_SOURCE });
await send('Page.navigate', { url });
await sleep(4000);
// 清库 → 注入标准测试数据 → reload
const ev0 = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await clearWithRetry(ev0, sleep);
await ev0(SEED_EXPR);
await send('Page.reload', { ignoreCache: true });
await sleep(8000); // 等待路线生长开场动画完成

const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  if (s.result?.data) writeFileSync(outDir + '/' + name, Buffer.from(s.result.data, 'base64'));
  console.log('shot:', name);
};

console.log('== 1. 点击城市节点 ==');
const clicked = await ev(`(function(){
  const node = document.querySelectorAll('.map-node')[0];
  node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return node.dataset.key;
})()`);
await sleep(1200);
const detailVisible = await ev(`(function(){
  const d = document.querySelector('.detail-panel');
  return d && getComputedStyle(d).display !== 'none';
})()`);
const detailText = await ev(`document.querySelector('.detail-place')?.textContent ?? null`);
console.log('clicked node:', clicked, '| detail visible:', detailVisible, '| place:', detailText);
await shot('e2e_1_detail.png');

console.log('== 2. 关闭详情，切到 Journeys ==');
await ev(`document.querySelector('.detail-close').click()`);
await ev(`location.hash = '#/journeys'`);
await sleep(900);
const tlItems = await ev(`document.querySelectorAll('.tl-item').length`);
console.log('timeline items:', tlItems);
await shot('e2e_2_journeys.png');

console.log('== 3. Stats ==');
await ev(`location.hash = '#/stats'`);
await sleep(1400);
const statNums = await ev(`[...document.querySelectorAll('.stat-card .num')].map(n=>n.textContent)`);
console.log('stats:', statNums);
await shot('e2e_3_stats.png');

console.log('== 4. Settings ==');
await ev(`location.hash = '#/settings'`);
await sleep(800);
await shot('e2e_4_settings.png');
// 切换深色主题
const darkOk = await ev(`(function(){
  const rows=[...document.querySelectorAll('.setting-row')];
  rows[0].querySelector('.toggle').click();
  return document.documentElement.getAttribute('data-theme');
})()`);
await sleep(900);
console.log('theme after toggle:', darkOk);
await shot('e2e_5_dark.png');
// 切回浅色
await ev(`document.querySelector('.toggle').click()`);
await sleep(500);

console.log('== 5. 回地图，Replay ==');
await ev(`location.hash = '#/'`);
await sleep(1200);
await ev(`document.querySelector('.map-titlebar .icon-btn').click()`); // replay 按钮
await sleep(600);
const replayPanelVisible = await ev(`(function(){
  const p=document.querySelector('.replay-panel');
  return p && getComputedStyle(p).display !== 'none';
})()`);
console.log('replay panel visible:', replayPanelVisible);
await shot('e2e_6_replaypanel.png');
// 点击 Replay Journey（第一个 btn-accent）
await ev(`(function(){
  const btn=[...document.querySelectorAll('.replay-panel .btn-accent')][0];
  if (btn) btn.click();
})()`);
await sleep(5000);
const replayYear = await ev(`document.querySelector('.replay-bar .year')?.textContent ?? null`);
console.log('replay year display:', replayYear);
await shot('e2e_7_replay.png');
// 停止 replay
await ev(`(function(){const b=document.querySelector('.replay-bar .icon-btn'); if(b) b.click();})()`);
await sleep(800);

console.log('== EXCEPTIONS: ' + exceptions.length + ' ==');
exceptions.slice(0, 10).forEach((e) => console.log('  ✗', e));
console.log(exceptions.length === 0 ? 'E2E PASS' : 'E2E FAIL');
ws.close();
edge.kill();
process.exit(exceptions.length === 0 ? 0 : 1);
