// mobilestats.mjs — 移动端 Stats 页面截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9373;
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
const until=async expression=>{for(let i=0;i<50;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timed out: '+expression);};
try{
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:'http://127.0.0.1:8123/tools/city-detail-review.html'});await until('window.reviewReady===true');
 await until('!!document.querySelector(".footprint-svg")');await sleep(1100);
 await evaluate(`window.check=(ok,msg)=>{if(!ok)throw Error(msg);};window.openCity=name=>{const button=[...document.querySelectorAll('.stats-city-row')].find(b=>b.textContent.includes(name));check(!!button,'Missing city '+name);button.scrollIntoView({block:'center'});window.originTop=reviewView.scroll.scrollTop;window.originButton=button;button.click();};`);
 await evaluate(`(()=>{check(document.querySelectorAll('.stats-city-row').length===4,'City preview capped at four');const select=document.querySelector('.stats-year-select');select.value='2026';select.dispatchEvent(new Event('change'));check(![...document.querySelectorAll('.stats-city-row')].some(b=>b.textContent.includes('杭州')),'Year-filtered list');openCity('上海');})()`);
 await until('document.querySelectorAll(".city-photo-grid img:not([hidden])").length===2');
 await evaluate(`(()=>{const d=reviewView.cityDetail.dialog;check(d.open,'Native dialog');check(d.querySelector('.city-detail-title').textContent==='上海','Catalog name');check(d.querySelector('.city-detail-subtitle').textContent==='中国','Catalog country');check([...d.querySelectorAll('dd')].map(e=>e.textContent).join('|')==='2|2025年3月1日|2026年9月3日','All-time dates and unique journey visits');check(d.querySelectorAll('.city-journey-row').length===2,'Relevant journeys only');check(d.contains(document.activeElement),'Focus inside dialog');})()`);
 report.checks.push('year-scoped canonical list','city name and country','all-time count and first/latest dates','photo ownership and deduplication','modal initial focus');
 for(const width of [320,390,768,1280]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<769});
  for(const theme of ['light','dark']){
   const layout=await evaluate(`(()=>{document.documentElement.dataset.theme='${theme}';const d=reviewView.cityDetail.dialog,r=d.getBoundingClientRect(),c=d.querySelector('.city-detail-content');check(r.left>=15&&r.right<=innerWidth-15,'Dialog edge inset');check(r.height<=innerHeight-30,'Dialog viewport height');check(c.scrollWidth<=c.clientWidth+1,'Content overflow');return {width:innerWidth,theme:'${theme}',dialogWidth:r.width,dialogHeight:r.height};})()`);report.layouts.push(layout);
   if(width===390){await sleep(400);const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync('tools/city-detail-'+theme+'.png',Buffer.from(shot.result.data,'base64'));}
  }
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 // View the exact journey, including the intermediate stop; return via real browser history.
 await evaluate(`reviewView.cityDetail.dialog.querySelector('[data-journey-id="old"]').click()`);
 await evaluate(`(()=>{const d=reviewView.cityDetail.dialog;check(d.querySelector('.city-detail-title').textContent==='江南春日 · 首次到访','Exact journey');check(d.querySelectorAll('.city-journey-route li').length===3,'Ordered stops');check(d.textContent.includes('途经点')&&d.textContent.includes('西湖边喝茶'),'Waypoint and note');history.back();})()`);
 await until('reviewView.cityDetail.dialog.querySelector(".city-detail-title")?.textContent==="上海"');
 await evaluate('reviewView.cityDetail.backButton.click()');await until('!reviewView.cityDetail.dialog.open');
 await evaluate(`(()=>{check(Math.abs(reviewView.scroll.scrollTop-originTop)<=1,'Stats scroll restored');check(document.activeElement===originButton,'Origin focus restored');check(document.querySelector('.stats-year-select').value==='2026','Year retained');check(createdUrls.every(u=>revokedUrls.includes(u)),'URLs revoked after back');})()`);
 report.checks.push('exact journey details and ordered waypoint notes','browser Back to city','UI Back to original statistics position and focus','year retained','photo URL cleanup');
 await evaluate(`openCity('景德镇')`);
 await evaluate(`(()=>{const d=reviewView.cityDetail.dialog;check(d.textContent.includes('还没有这个地方的照片'),'Small empty state');check(!d.querySelector('.city-photo-grid'),'No empty photo grid');check(d.querySelector('.city-detail-hint').getBoundingClientRect().height<40,'Compact hint');})()`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until('!reviewView.cityDetail.dialog.open');
 report.checks.push('compact no-photo state','Escape returns to statistics');
 // A delayed photo response after closing must be disposed rather than rendered.
 await evaluate(`window.photoDelay=250;openCity('上海');reviewView.cityDetail.backButton.click();`);await until('!reviewView.cityDetail.dialog.open');await sleep(400);
 await evaluate(`check(createdUrls.every(u=>revokedUrls.includes(u)),'Late URLs revoked')`);report.checks.push('late photo requests cleaned up');
 await evaluate(`window.photoDelay=0;window.photoMode='error';openCity('上海');`);
 await until('reviewView.cityDetail.dialog.textContent.includes("照片暂不可用")');
 await evaluate('reviewView.cityDetail.backButton.click()');await until('!reviewView.cityDetail.dialog.open');report.checks.push('photo read failures stay compact');
 await evaluate(`(()=>{reviewI18n.setLang('en');reviewView.onShow();openCity('Shanghai');check(reviewView.cityDetail.dialog.querySelector('.city-detail-subtitle').textContent==='China','English country');check(reviewView.cityDetail.dialog.textContent.includes('First visited'),'English labels');reviewView.cityDetail.backButton.click();})()`);await until('!reviewView.cityDetail.dialog.open');
 await evaluate(`check(JSON.stringify(reviewRepo.state)===sourceSnapshot,'Source records unchanged')`);
 report.checks.push('English details','source records unchanged');

 // Exercise the unchanged production hash router, not only the isolated view.
 const fixture=await evaluate('JSON.parse(sourceSnapshot)');
 await send('Page.navigate',{url:'http://127.0.0.1:8123/#/stats'});
 await until('!!document.querySelector(".stats-page.is-active")');
 await evaluate(`(async()=>{const repo=await import('/js/data/repo.js');const i18n=await import('/js/i18n/index.js');i18n.setLang('zh');Object.assign(repo.state,${JSON.stringify(fixture)});const {emit}=await import('/js/core/eventbus.js');emit('data:changed');window.check=(ok,msg)=>{if(!ok)throw Error(msg);};})()`);
 await until('!!document.querySelector(".stats-page .footprint-svg")');await sleep(1100);
 await evaluate(`(()=>{const root=document.querySelector('.stats-page'),select=root.querySelector('select');select.value='2026';select.dispatchEvent(new Event('change'));})()`);
 await until('!!document.querySelector(".stats-page .footprint-svg")');
 await evaluate(`(()=>{const root=document.querySelector('.stats-page');const button=[...root.querySelectorAll('.stats-city-row')].find(b=>b.textContent.includes('上海'));button.scrollIntoView({block:'center'});window.savedStatsTop=root.querySelector('.view-scroll').scrollTop;button.click();})()`);
 await until('!!document.querySelector(".city-detail-dialog[open]")');
 await evaluate(`document.querySelector('[data-journey-id="old"]').click()`);
 await evaluate('history.back()');await until('document.querySelector(".city-detail-title")?.textContent==="上海"');
 await evaluate('history.back()');await until('!document.querySelector(".city-detail-dialog[open]")');
 await evaluate(`(()=>{const root=document.querySelector('.stats-page');check(root.classList.contains('is-active'),'Stats remains active');check(root.querySelector('select').value==='2026','Real router year retained');check(Math.abs(root.querySelector('.view-scroll').scrollTop-savedStatsTop)<2,'Real router scroll retained');check(document.querySelectorAll('.tabbar-item').length===3,'No additional Tab');})()`);
 await evaluate('history.forward()');await until('!!document.querySelector(".city-detail-dialog[open]")');
 await evaluate('history.forward()');await until('document.querySelector(".city-detail-title")?.textContent==="江南春日 · 首次到访"');
 await evaluate('history.go(-2)');await until('!document.querySelector(".city-detail-dialog[open]")');
 await evaluate(`check(Math.abs(document.querySelector('.stats-page .view-scroll').scrollTop-savedStatsTop)<2,'Multi-level back restores scroll')`);
 report.checks.push('production router Back/Forward and multi-level return','production year and scroll retained','three original Tabs only');

 report.status='PASS';console.log(JSON.stringify(report,null,2));
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{writeFileSync('tools/city-detail-ui-report.json',JSON.stringify(report,null,2));ws.close();edge.kill();}
