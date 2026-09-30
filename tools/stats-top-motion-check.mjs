// mobilestats.mjs — 移动端 Stats 页面截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9374;
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


const report={checks:[],layouts:[]};
function unwrap(response){if(response.error||response.result?.exceptionDetails)throw Error(JSON.stringify(response));return response.result?.result?.value;}
const evaluate=async expression=>unwrap(await ev(expression));
const until=async expression=>{for(let i=0;i<60;i++){if(await evaluate(expression))return;await sleep(50);}throw Error('Timed out: '+expression);};
const pointer=async(type,x,y)=>send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});
const click=async(x,y)=>{await pointer('mousePressed',x,y);await pointer('mouseReleased',x,y);};
try{
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:'http://127.0.0.1:8123/tools/city-detail-review.html'});await until('window.reviewReady===true');await sleep(1100);
 await evaluate(`window.check=(ok,msg)=>{if(!ok)throw Error(msg);};window.openCity=()=>{const b=[...document.querySelectorAll('.stats-city-row')].find(b=>b.textContent.includes('上海')||b.textContent.includes('Shanghai'));check(!!b,'City button');window.savedTop=reviewView.scroll.scrollTop;window.savedFocus=b;b.click();};`);
 await evaluate(`(()=>{const section=document.querySelector('.stats-overview');check(section.querySelectorAll('.stat-card').length===4,'Four core metrics');check(section.querySelectorAll('.stats-city-row').length===4,'Only four cities');check(!document.querySelector('.view-scroll > .stats-city-list'),'No bottom list');check(section.compareDocumentPosition(document.querySelector('.stats-section'))&Node.DOCUMENT_POSITION_FOLLOWING,'Overview before other sections');})()`);
 report.checks.push('overview includes four metrics and capped city preview','bottom list removed');
 // Count previews independently of the unchanged totals, including fewer than four and zero.
 await evaluate(`(()=>{const snapshot=JSON.parse(sourceSnapshot);const source=[snapshot.places[0],snapshot.places[1],snapshot.places[3],snapshot.places[5],snapshot.places[6]];for(let count=0;count<=5;count++){Object.assign(reviewRepo.state,{journeys:count?[{id:'sample',startDate:'2026-01-01'}]:[],places:source.slice(0,count).map(p=>({...p,journeyId:'sample'})),photos:[]});reviewView._year=null;reviewView._render();check(document.querySelectorAll('.stats-city-row').length===Math.min(count,4),'Actual city count '+count);check(reviewView._targets[0].to===count,'Full city metric '+count);check(document.querySelectorAll('.stats-city-list li').length===Math.min(count,4),'No placeholders');}Object.assign(reviewRepo.state,snapshot);reviewView._render();})()`);
 report.checks.push('0–5 cities: real entries only, full metrics unaffected');
 for(const locale of ['zh','en'])for(const width of [320,390,600,768,769,1024,1280,1600]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<769});
  for(const theme of ['light','dark']){
   const layout=await evaluate(`(()=>{reviewI18n.setLang('${locale}');document.documentElement.dataset.theme='${theme}';reviewView._render();const scroll=reviewView.scroll,bounds=scroll.getBoundingClientRect(),overview=scroll.querySelector('.stats-overview'),r=overview.getBoundingClientRect();check(scroll.scrollWidth<=scroll.clientWidth+1,'Page overflow');for(const e of overview.querySelectorAll('.stat-card,.stats-city-row')){const b=e.getBoundingClientRect();check(b.left>=bounds.left+23&&b.right<=bounds.right-23,'Content edge');check(e.scrollWidth<=e.clientWidth+1,'Tile overflow');}return {width:innerWidth,locale:'${locale}',theme:'${theme}',height:r.height,cities:overview.querySelectorAll('.stats-city-row').length};})()`);report.layouts.push(layout);
   if(locale==='zh'&&[390,1280].includes(width)){
    await sleep(1000);const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync('tools/stats-top-'+width+'-'+theme+'.png',Buffer.from(shot.result.data,'base64'));
   }
  }
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate(`reviewI18n.setLang('zh');reviewView._render();reviewView.scroll.scrollTop=80;openCity();`);
 await evaluate(`(()=>{const d=reviewView.cityDetail.dialog;check(d.classList.contains('is-entering'),'Entry class');const animation=d.getAnimations().find(a=>a.animationName==='city-detail-enter');check(!!animation,'Entry animation');const frames=animation.effect.getKeyframes();check(frames[0].transform.includes('36px')&&frames.at(-1).transform.includes('0'),'Upwards entry');})()`);
 await until('!reviewView.cityDetail.dialog.classList.contains("is-entering")');
 // Inside content and inner blank padding must not dismiss.
 let inside=await evaluate(`(()=>{const d=reviewView.cityDetail.dialog.getBoundingClientRect();return {x:d.left+4,y:d.top+60};})()`);await click(inside.x,inside.y);
 await evaluate(`check(reviewView.cityDetail.dialog.open&&!reviewView.cityDetail.closing,'Inner padding does not close')`);
 await pointer('mousePressed',inside.x,inside.y);await pointer('mouseReleased',5,5);await sleep(50);
 await evaluate(`check(reviewView.cityDetail.dialog.open&&!reviewView.cityDetail.closing,'Inside-to-outside drag does not close')`);
 await click(5,5);
 await until('!!reviewView.cityDetail.closing');
 await evaluate(`(()=>{const d=reviewView.cityDetail.dialog;check(d.open&&d.inert,'Modal remains mounted and inert during exit');check(d.classList.contains('is-exiting'),'Exit animation');check(document.activeElement!==savedFocus,'Underlying focus not restored early');const a=d.getAnimations().find(a=>a.animationName==='city-detail-exit');check(a.effect.getKeyframes().at(-1).transform.includes('36px'),'Downward exit');})()`);
 await until('!reviewView.cityDetail.dialog.open');
 await evaluate(`check(Math.abs(reviewView.scroll.scrollTop-savedTop)<2&&document.activeElement===savedFocus,'Restore scroll and focus after exit')`);
 report.checks.push('upward entry animation','inside padding and drag protection','outside click exits downwards','native modal held until exit completes','scroll and focus restored after exit');
 // Back button uses the same exit; nested journey backdrop dismisses both history entries.
 await evaluate('openCity()');await until('!reviewView.cityDetail.dialog.classList.contains("is-entering")');await evaluate('reviewView.cityDetail.backButton.click()');await until('!!reviewView.cityDetail.closing');await until('!reviewView.cityDetail.dialog.open');
 await evaluate('openCity()');await until('!reviewView.cityDetail.dialog.classList.contains("is-entering")');await evaluate(`reviewView.cityDetail.dialog.querySelector('.city-journey-row').click()`);await click(5,5);await until('!reviewView.cityDetail.dialog.open');
 await evaluate(`check(!history.state?.travelCityDetail,'Backdrop exits entire journey drill-down')`);
 report.checks.push('Back button uses exit animation','journey backdrop closes full drill-down');

 await evaluate('openCity()');await until('!reviewView.cityDetail.dialog.classList.contains("is-entering")');
 await evaluate(`reviewView.cityDetail.dialog.querySelector('.city-journey-row').click();check(!!reviewView.cityDetail.layerMotion,'Journey enters as a content layer');check(getComputedStyle(reviewView.cityDetail.dialog,'::backdrop').animationName==='none','Backdrop remains steady between layers');`);
 await until('!reviewView.cityDetail.layerMotion');
 await evaluate('reviewView.cityDetail.backButton.click()');await until('!!reviewView.cityDetail.layerMotion');
 await evaluate(`check(!!reviewView.cityDetail.dialog.querySelector('.city-detail-outgoing .city-journey-route'),'Outgoing journey stays until downward exit ends');check(!!reviewView.cityDetail.content.querySelector('.city-journey-row'),'City reveals concurrently')`);
 await until('!reviewView.cityDetail.layerMotion');await evaluate(`check(!!reviewView.cityDetail.dialog.querySelector('.city-journey-row')&&reviewView.cityDetail.dialog.open,'Back reveals city without closing modal');check(document.activeElement.matches('[data-journey-id]'),'Related journey focus restored');reviewView.cityDetail.backButton.click();`);await until('!reviewView.cityDetail.dialog.open');
 report.checks.push('nested journey upward entry and downward return','steady inter-layer backdrop','city content and focus restored after exit');
 // A browser Forward during exit must cancel the stale close operation.
 await evaluate('openCity()');await until('!reviewView.cityDetail.dialog.classList.contains("is-entering")');await evaluate('history.back()');await until('!!reviewView.cityDetail.closing');await evaluate('history.forward()');await until('!reviewView.cityDetail.closing');await sleep(350);
 await evaluate(`check(reviewView.cityDetail.dialog.open&&!reviewView.cityDetail.dialog.inert,'Forward cancels old exit')`);await evaluate('reviewView.cityDetail.backButton.click()');await until('!reviewView.cityDetail.dialog.open');
 report.checks.push('rapid Back/Forward cannot close reopened detail');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await evaluate('openCity()');await evaluate(`check(reviewView.cityDetail.dialog.getAnimations().length===0,'Reduced-motion entry')`);await evaluate('reviewView.cityDetail.backButton.click()');await until('!reviewView.cityDetail.dialog.open');
 report.checks.push('reduced-motion preference');
 await evaluate(`check(JSON.stringify(reviewRepo.state)===sourceSnapshot,'Original records unchanged')`);
 report.status='PASS';console.log(JSON.stringify({status:report.status,checks:report.checks,layouts:report.layouts.length},null,2));
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{writeFileSync('tools/stats-top-motion-report.json',JSON.stringify(report,null,2));ws.close();edge.kill();}
