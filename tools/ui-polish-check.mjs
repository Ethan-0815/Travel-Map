// mobilestats.mjs — 移动端 Stats 页面截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9375;
const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + process.env.TEMP + '/edge-mstats-' + Date.now() + '-profile',
  '--window-size=390,844', 'about:blank',
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
const ev = (expr) => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });


const evaluate=async expression=>{const r=await ev(expression);if(r.error||r.result?.exceptionDetails)throw Error(JSON.stringify(r));return r.result?.result?.value;};
try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:'http://127.0.0.1:8123/tools/city-detail-review.html'});await sleep(1500);
 const result=await evaluate(`(async()=>{
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};const wait=ms=>new Promise(r=>setTimeout(r,ms));const checks=[];
 let picker=document.querySelector('.stats-year-picker');picker.querySelector('summary').click();check(picker.open,'Year menu opens');
 check(parseFloat(getComputedStyle(picker.querySelector('.stats-year-menu')).borderRadius)>=12,'Rounded menu');
 const trigger=picker.querySelector('summary').getBoundingClientRect(),label=picker.querySelector('summary > span').getBoundingClientRect();check(Math.abs((trigger.left+trigger.right-label.left-label.right)/2)<1,'Centered year label');
 const option=[...picker.querySelectorAll('button')].find(b=>b.textContent==='2025');option.click();check(reviewView._year===2025,'Year filter updates');
 picker=document.querySelector('.stats-year-picker');check(!picker.open,'Menu closes after selection');check(document.activeElement===picker.querySelector('summary'),'Trigger focus restored');
 picker.querySelector('summary').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));check(picker.open&&document.activeElement.getAttribute('role')==='menuitemradio','Keyboard year navigation');
 picker.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check(!picker.open,'Escape closes menu');
 check(document.querySelector('.stats-city-hint').textContent.includes('点击城市'),'Clickable city hint');checks.push('rounded year menu','centered label','year selection and keyboard','city click hint');
 const {JourneysView}=await import('/js/views/journeysView.js');const timeline=new JourneysView(reviewView.app);timeline.mount(document.querySelector('#overlay'));await wait(50);
 const tl=timeline.scroll.querySelector('.timeline'),line=tl.querySelector('.tl-line'),first=tl.querySelector('.tl-year'),last=tl.querySelector('.tl-item:last-child');
 check(Math.abs(line.offsetTop-(first.offsetTop+first.offsetHeight/2))<1,'Timeline starts at year marker');check(Math.abs(line.offsetTop+line.offsetHeight-(last.offsetTop+last.offsetHeight/2))<1,'Timeline ends at last marker');timeline.unmount();checks.push('timeline fits first and final markers');
 const {MapPage}=await import('/js/views/mapPage.js');const {replayController}=await import('/js/replay/replayController.js');
 const page=new MapPage(reviewView.app);page.root=document.createElement('div');page.root.style='position:fixed;inset:0;z-index:200;background:var(--bg)';document.body.append(page.root);
 const fakeMap={_playbackEpoch:0,camera:{cam:{k:1}},hideAllRoutes(){this._playbackEpoch++;},clearActive(){},_journeyPlaces(){return [];},_updateLabels(){},cancelRoutePlayback(){this._playbackEpoch++;},showAllRoutes(){},fitTo:async()=>{}};
 const start=()=>replayController.start({mapView:fakeMap,journeys:[{id:'test',startDate:'2026-01-01'}],repo:{state:{places:[]}},onYear:y=>page._onReplayYear(y),onDone:()=>page._onReplayDone()});
 const playback=start();await wait(60);check(!!page.replayBar,'Replay year visible');page.replayBar.querySelector('button').click();check(!page.replayBar&&!replayController.running,'Cancel removes bar immediately');await playback;await wait(50);check(!page.replayBar,'Late year frames do not resurrect bar');
 const again=start();await wait(50);page.replayBar.querySelector('button').click();await again;check(!page.replayBar&&!replayController.running,'Replay can restart and cancel');page.root.remove();checks.push('cancel clears year bar','late frames suppressed','replay restart/cancel');
 reviewI18n.setLang('en');reviewView._render();check(document.querySelector('.stats-city-hint').textContent.includes('Tap a city'),'English hint');check(document.querySelector('.stats-year-trigger').textContent.includes('2025'),'English year retained');
 reviewI18n.setLang('zh');reviewView._year=null;reviewView._render();document.querySelector('.stats-year-trigger').click();
 return {status:'PASS',checks};
})()`);
 console.log(JSON.stringify(result,null,2));await sleep(300);const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync('tools/ui-polish-year-menu.png',Buffer.from(shot.result.data,'base64'));
}catch(error){console.error(error);process.exitCode=1;}finally{ws.close();edge.kill();}
