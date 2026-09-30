// mobilestats.mjs — 移动端 Stats 页面截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9372;
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


const report={layouts:[],checks:[]};
function unwrap(response){if(response.error||response.result?.exceptionDetails)throw Error(JSON.stringify(response));return response.result?.result?.value;}
try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
 await send('Page.navigate',{url:'http://127.0.0.1:8123/tools/stats-review.html'});
 await sleep(9000);
 const prior=unwrap(await ev('window.reviewResult'));if(prior?.status!=='PASS')throw Error(JSON.stringify(prior));
 report.checks.push(...prior.checks);
 unwrap(await ev(`(async()=>{
   window.cityModule=await import('/js/utils/cityIndex.js');
   window.formModule=await import('/js/views/journeyForm.js');
   window.statsI18n=await import('/js/i18n/index.js');
   document.querySelector('#review').style.display='none';
   document.querySelector('#review-status').style.display='none';
   const style=document.createElement('style');style.id='test-scrollbar';document.head.append(style);
 })()`));
 // Effective CSS viewports and DPRs model desktop browser zoom; test multiple native scrollbar widths.
 for(const [width,height,scale] of [[320,700,1],[360,800,1],[390,844,1],[600,800,1],[768,900,1],[769,900,1],[1024,900,1],[1280,900,1],[1920,1080,1],...[0.8,1.25,1.5,1.75,2].map(z=>[Math.round(1280/z),Math.round(900/z),z])]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
  for(const theme of ['light','dark'])for(const bar of [8,20]){
   const result=unwrap(await ev(`(()=>{
    document.documentElement.dataset.theme='${theme}';
    document.querySelector('#test-scrollbar').textContent='::-webkit-scrollbar{width:${bar}px}';
    const scroll=document.querySelector('.stats-page .view-scroll'),bounds=scroll.getBoundingClientRect();
    const errors=[];
    for(const e of scroll.querySelectorAll('.stats-grid,.stats-filter,.stats-insights,.highlights,.heat-grid,.stats-timeline,.footprint-wrap')){
      const r=e.getBoundingClientRect();
      if(r.left<bounds.left+23||r.right>bounds.right-23)errors.push(e.className+' edge clearance');
    }
    for(const e of scroll.querySelectorAll('.num,.h-value,.h-sub,.heat-month,.stats-year-select')){
      if(e.scrollWidth>e.clientWidth+1)errors.push(e.className+' clipped text');
    }
    if(scroll.scrollWidth>scroll.clientWidth+1)errors.push('horizontal overflow');
    return {width:innerWidth,scale:${scale},theme:'${theme}',scrollbar:${bar},errors,months:getComputedStyle(scroll.querySelector('.heat-month')).fontSize,helper:getComputedStyle(scroll.querySelector('.h-sub')).fontSize};
   })()`));
   report.layouts.push(result);if(result.errors.length)throw Error(JSON.stringify(result));
  }
 }
 // English labels at the narrowest size must stay readable as well.
 await send('Emulation.setDeviceMetricsOverride',{width:320,height:780,deviceScaleFactor:1,mobile:true});
 unwrap(await ev(`(async()=>{const {StatsView}=await import('/js/views/statsView.js');window.statsI18n.setLang('en');const {default:repo}=await import('/js/data/repo.js');window.englishView=new StatsView({repo,i18n:window.statsI18n,t:window.statsI18n.t,router:{go(){}}});document.querySelector('#views').replaceChildren();window.englishView.mount(document.querySelector('#views'));})()`));
 await sleep(1100);
 unwrap(await ev(`(()=>{for(const e of document.querySelectorAll('.heat-month,.h-label,.h-value,.h-sub'))if(e.scrollWidth>e.clientWidth+1)throw Error('English overflow: '+e.className);})()`));
 report.checks.push('English text at 320px');
 await ev("document.querySelector('#test-scrollbar').textContent=''");
 for(const theme of ['light','dark']){
  await ev(`document.documentElement.dataset.theme='${theme}'`);
  await sleep(400);
  const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync('tools/stats-readable-'+theme+'.png',Buffer.from(shot.result.data,'base64'));
 }
 // Offline selection uses the same production form with memory-only drafts; no save is invoked.
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 report.selection=unwrap(await ev(`(()=>{
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  const i18n=window.statsI18n;
  i18n.setLang('zh');
  const app={i18n,t:i18n.t,router:{current:{params:{}},back(){},go(){}},repo:{state:{journeys:[]}}};
  const form=new window.formModule.JourneyForm(app);form.mount(document.querySelector('#overlay'));
  const choose=(role,query,expected)=>{
    const input=form.scroll.querySelector('[data-role="'+role+'"] .city-search input');
    input.value=query;input.dispatchEvent(new Event('input'));
    const item=form.scroll.querySelector('[data-role="'+role+'"] .city-suggest-item');
    check(!!item,'Missing suggestion: '+query);
    check(item.querySelector('.c').textContent===expected,'Country label: '+query);
    item.click();
    const card=form.scroll.querySelector('[data-role="'+role+'"]');
    const coords=[...card.querySelectorAll('input[type="number"]')].map(e=>Number(e.value));
    const hit=window.cityModule.lookupCity(query);
    check(coords[0]===hit.lat&&coords[1]===hit.lng,'Coordinate autofill: '+query);
    return coords;
  };
  const start=choose('start','腾冲','中国');
  i18n.setLang('en');const destination=choose('destination','Queenstown','New Zealand');
  const draft=form._blankDraft();form._applyCity(draft,window.cityModule.lookupCity('景德镇'));
  const waypoint=form._toRow(draft,'waypoint');
  check(waypoint.role==='waypoint'&&waypoint.country==='China'&&waypoint.lat===29.2687&&waypoint.lng===117.1784,'Waypoint record compatibility');
  const longQuery=form.scroll.querySelector('[data-role="destination"] .city-search input');
  longQuery.value='Sarajevo';longQuery.dispatchEvent(new Event('input'));
  const suggestion=form.scroll.querySelector('[data-role="destination"] .city-suggest-item');
  check(suggestion.textContent.includes('Bosnia and Herzegovina'),'Long country label');
  check(suggestion.scrollWidth<=suggestion.clientWidth+1,'Long city/country overflow');
  const result={offline:!navigator.onLine,start,destination,waypoint:{role:waypoint.role,lat:waypoint.lat,lng:waypoint.lng},countries:'Chinese and English'};
  form.unmount();return result;
 })()`));
 if(!report.selection.offline)throw Error('Offline check did not run offline');
 report.checks.push('offline start and destination selection','waypoint record compatibility','localized country names','long country name wrapping');
 report.status='PASS';console.log(JSON.stringify({status:report.status,layouts:report.layouts.length,checks:report.checks,selection:report.selection},null,2));
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{writeFileSync('tools/city-stats-ui-report.json',JSON.stringify(report,null,2));ws.close();edge.kill();}
