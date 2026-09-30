import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const port = 9389;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  `--remote-debugging-port=${port}`, '--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/travel-delete-test-${Date.now()}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
try {
  let target;
  for (let n = 0; n < 40 && !target; n++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    if (!target) await sleep(250);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = e => { const data = JSON.parse(e.data); pending.get(data.id)?.(data); pending.delete(data.id); };
  const send = (method, params = {}) => new Promise(resolve => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.error || r.result.exceptionDetails) throw Error(JSON.stringify(r));
    return r.result.result.value;
  };
  const run = method => evaluate(`import('/tools/delete-travel-browser.js').then(m=>m.${method}())`);
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8123/tools/city-detail-review.html' });
  for (let n = 0; n < 80 && !await evaluate('window.reviewReady===true'); n++) await sleep(100);
  await run('setup'); await run('openList'); await run('confirmFirst');
  for (const width of [320, 390, 1280]) for (const theme of ['light', 'dark']) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 769 });
    await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await run('bounds');
    if (width === 390) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`tools/delete-travel-${theme}.png`, Buffer.from(shot.result.data, 'base64'));
    }
  }
  console.log(await run('exercise'));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  console.log(await run('reducedEmpty'));
  console.log('PASS six mobile/desktop theme layouts; tests used a fresh browser database only');
} finally { ws?.close(); edge.kill(); }
