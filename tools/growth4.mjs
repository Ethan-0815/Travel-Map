// growth4.mjs — 生长动画动态序列采样（首次 navigate，rAF 正常，高频采样）
// 验证：① 节点/标签随时间递增出现（终点在抵达前隐藏）② 最终全部可见
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9361;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + process.env.TEMP + '/edge-g4-' + Date.now() + '-profile',
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
};
const send = (m, p = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

const visCount = () => ev(`(() => {
  const nodes = [...document.querySelectorAll('.map-node')];
  const labels = [...document.querySelectorAll('.map-label')];
  return {
    n: nodes.filter(g => parseFloat(g.style.opacity || '0') > 0.9).length,
    N: nodes.length,
    l: labels.filter(t => parseFloat(t.style.opacity || '0') > 0.9).length,
    L: labels.length,
  };
})()`);

let exitCode = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) exitCode = 1; };

await send('Runtime.enable');
await send('Page.enable');

// ============ 首次加载（Demo 数据，7 城市 2 旅程），高频采样生长序列 ============
console.log('== Demo 生长序列（首次 navigate，rAF 正常） ==');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/' });
// 高频采样 6 秒，每 150ms 一次
const samples = [];
for (let i = 0; i < 40; i++) {
  try {
    const s = await visCount();
    if (s.N > 0) samples.push({ t: i * 150, ...s });
  } catch {}
  await sleep(150);
}
console.log('  采样序列 (t, n/N, l/L):');
for (const s of samples) console.log(`    ${String(s.t).padStart(5)}ms  n=${s.n}/${s.N}  l=${s.l}/${s.L}`);

// 分析：是否递增出现（存在 n 从 0 逐步涨到 N 的过程）
const maxN = Math.max(...samples.map((s) => s.n));
const firstVisible = samples.find((s) => s.n > 0);
const lastSample = samples[samples.length - 1];
ok(maxN === lastSample.N, `最终全部节点可见 ${maxN}/${lastSample.N}`);
ok(samples.some((s) => s.n > 0 && s.n < s.N), `存在中间态（部分节点隐藏，即终点未提前显示）`);
ok(samples.some((s) => s.l > 0 && s.l < s.L), `标签同样逐步出现（城市名非全量预显）`);

// 递增单调性：n 序列应该非递减（生长只增不减）
let monotonic = true;
for (let i = 1; i < samples.length; i++) {
  if (samples[i].n < samples[i - 1].n) { monotonic = false; break; }
}
ok(monotonic, '节点数随时间非递减（按旅程顺序点亮）');

console.log('== EXCEPTIONS: ' + exceptions.length + ' ==');
exceptions.slice(0, 8).forEach((e) => console.log('  ✗', e));
if (exceptions.length) exitCode = 1;
console.log(exitCode ? 'GROWTH4 FAIL' : 'GROWTH4 PASS');
ws.close();
edge.kill();
process.exit(exitCode);
