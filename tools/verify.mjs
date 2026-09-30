// verify.mjs — 用 CDP 驱动 Edge 无头浏览器做真实运行时验证
// 用法: node tools/verify.mjs [url] [waitMs]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const url = process.argv[2] || 'http://127.0.0.1:8123/';
const waitMs = Number(process.argv[3] || 4000);

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=' + process.env.TEMP + '/edge-verify-profile',
  '--window-size=1440,900',
  'about:blank',
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
  throw new Error('no debug target');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const consoleMsgs = [];
const exceptions = [];

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    consoleMsgs.push(`[${msg.params.type}] ${text}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    exceptions.push(`${d.text} ${d.exception?.description || ''}`);
  }
};

function send(method, params = {}) {
  return new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(waitMs);

// 收集诊断
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.result?.value;
};

const diag = {
  title: await evalJs('document.title'),
  viewsChildren: await evalJs(`document.getElementById('views')?.children.length ?? -1`),
  mapSvg: await evalJs(`document.querySelectorAll('.map-svg').length`),
  worldPaths: await evalJs(`document.querySelectorAll('.world path').length`),
  nodes: await evalJs(`document.querySelectorAll('.map-node').length`),
  labels: await evalJs(`document.querySelectorAll('.map-label').length`),
  routes: await evalJs(`document.querySelectorAll('.route').length`),
  routeLegs: await evalJs(`document.querySelectorAll('.route path').length`),
  tabLabels: await evalJs(`[...document.querySelectorAll('.tabbar-item span')].map(s=>s.textContent)`),
  statsNums: await evalJs(`[...document.querySelectorAll('.map-stats .num')].map(s=>s.textContent)`),
  brand: await evalJs(`document.querySelector('.brand')?.textContent ?? null`),
  bodyBg: await evalJs(`getComputedStyle(document.body).backgroundColor`),
  demoBannerShown: await evalJs(`(function(){const b=document.querySelector('.demo-banner');return b? getComputedStyle(b).display!=='none':false;})()`),
  idbJourneys: await evalJs(`(async function(){try{const dbs=await indexedDB.databases();const has=dbs.some(d=>d.name==='travel-map');return has?'db-exists':'db-missing';}catch(e){return 'idb-error:'+e.message;}})()`),
};

console.log('==== DIAG ====');
console.log(JSON.stringify(diag, null, 2));
console.log('==== CONSOLE (' + consoleMsgs.length + ') ====');
for (const m of consoleMsgs.slice(0, 40)) console.log(m);
console.log('==== EXCEPTIONS (' + exceptions.length + ') ====');
for (const m of exceptions.slice(0, 20)) console.log(m);

// 截图
const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) {
  const path = process.env.TEMP + '/travelmap_verify.png';
  writeFileSync(path, Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot saved:', path);
}

ws.close();
edge.kill();
process.exit(0);
