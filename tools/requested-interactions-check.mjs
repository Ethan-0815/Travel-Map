// Isolated browser profile and memory fixtures: never reads or writes user journeys.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const port = 9386;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  `--remote-debugging-port=${port}`, '--headless=new', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${process.env.TEMP}/travel-interactions-${Date.now()}`,
  'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, id = 0;
const pending = new Map();
try {
  let target;
  for (let n = 0; n < 40 && !target; n++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    if (!target) await sleep(250);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => { const data = JSON.parse(event.data); pending.get(data.id)?.(data); pending.delete(data.id); };
  const send = (method, params = {}) => new Promise(resolve => { const key = ++id; pending.set(key, resolve); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.error || r.result.exceptionDetails) throw Error(JSON.stringify(r));
    return r.result.result.value;
  };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8123/tools/city-detail-review.html' });
  for (let n = 0; n < 80 && !await evaluate('window.reviewReady === true'); n++) await sleep(100);
  console.log(await evaluate(`import('/tools/requested-interactions-browser.js').then(m => m.run())`));
  const replayPoint = await evaluate(`import('/tools/requested-interactions-browser.js').then(m => m.prepareReplayTouch())`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [replayPoint] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(50);
  console.log(await evaluate(`import('/tools/requested-interactions-browser.js').then(m => m.finishReplayTouch())`));
  // Exercise the picker with native mobile touch dispatch, not just DOM clicks.
  const point = await evaluate(`(()=>{const r=document.querySelector('.stats-year-trigger').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for (let n = 0; n < 2; n++) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    if (await evaluate(`document.querySelector('.stats-year-picker').open`) !== (n === 0)) throw Error('Mobile touch toggle');
  }
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme='${theme}';document.querySelector('.stats-year-trigger').click()`);
    await sleep(280);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`tools/requested-picker-${theme}.png`, Buffer.from(shot.result.data, 'base64'));
    await evaluate(`document.querySelector('.stats-year-trigger').click()`); await sleep(280);
  }
  for (const [width, locale, theme] of [[320, 'en', 'dark'], [390, 'zh', 'light'], [1280, 'en', 'dark']]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 769 });
    await evaluate(`reviewI18n.setLang('${locale}');document.documentElement.dataset.theme='${theme}';reviewView._render()`);
    console.log(width, locale, theme, await evaluate(`import('/tools/requested-interactions-browser.js').then(m => m.stressDetail())`));
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  console.log(await evaluate(`import('/tools/requested-interactions-browser.js').then(m => m.reduced())`));
  console.log('PASS mobile touch, light/dark screenshots, reduced motion');
} finally { ws?.close(); edge.kill(); }
