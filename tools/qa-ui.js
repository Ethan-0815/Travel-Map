import { Router } from '../js/router.js';
import * as i18n from '../js/i18n/index.js';
const q=new URLSearchParams(location.search);document.documentElement.dataset.theme=q.get('theme')||'light';
const points=[['Beijing',116.4074,39.9042],['Guangzhou',113.2644,23.1291],['Hangzhou',120.1551,30.2741],['Beijing',116.4074,39.9042],['Osaka',135.5023,34.6937]];
const journeys=[{id:'qa',title:'多途经点验收',startDate:'2026-09-20',endDate:'2026-09-24'}];
const places=points.map(([name,lng,lat],seq)=>({id:'p'+seq,journeyId:'qa',name,lng,lat,country:'测试',seq,role:seq===0?'start':seq===4?'destination':'waypoint',arriveAt:`2026-09-${20+seq}T00:00`,photoIds:[]}));
const repo={state:{journeys,places},uniquePlaces:()=>[...new Map(places.map(p=>[p.name,p])).values()],placesByJourney:id=>id==='qa'?places:[],stats:()=>({cities:4,countries:2,journeys:1,distance:4456})};
let toast='';const app={repo,i18n,t:i18n.t,pendingNewJourney:null,getTheme:()=>document.documentElement.dataset.theme,setTheme:theme=>document.documentElement.dataset.theme=theme,setLang:i18n.setLang,toast:s=>toast=s};
i18n.setLang('zh');app.router=new Router(app);app.router.init(document.querySelector('#views'),document.querySelector('#overlay'),document.querySelector('.tabbar'));app.router.navigate(q.get('view')||'stats',{}, {updateHash:false});
i18n.applyI18n(document.body);
const result={width:innerWidth,theme:app.getTheme(),view:q.get('view')||'stats',checks:[],failures:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function check(ok,msg){(ok?result.checks:result.failures).push(msg);}
function send(){result.status=result.failures.length?'FAIL':'PASS';parent.postMessage({qaUI:result},location.origin);}
await sleep(1500);
if(q.get('functional')){
 const map=app.router.tabs.map;result.entry={visibility:getComputedStyle(map.statsCard).visibility,classes:map.statsCard.className,growing:map.mapView._growing};check(getComputedStyle(map.statsCard).visibility==='hidden','Entry statistics hidden');
 await map._resetView();const first=map.mapView.camera.cam.k;await map._resetView();const second=map.mapView.camera.cam.k;await map._resetView();const third=map.mapView.camera.cam.k;check(first>1&&second===1&&third>1,'Focus alternates route/world/route');
 app.router.navigate('journeyForm',{}, {updateHash:false});const form=app.router.overlay;const d=new Date();const today=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');check(form._start.arriveAt===today&&form._destination.arriveAt===today,'New dates equal local today');
 form.startWrap.querySelector('.city-chip').click();form.destWrap.querySelectorAll('.city-chip')[1].click();await form._save();check(toast==='请填写旅程名称','Missing name has correct validation message');
 app.router.navigate('settings',{}, {updateHash:false});const settings=app.router.overlay;await settings._back();check(!settings.mounted&&app.router.overlay===null,'Settings return animation completes');
 app.router.navigate(result.view,{}, {updateHash:false});await sleep(1000);
}
const scroll=document.querySelector('#views .view.is-active .view-scroll');check(document.documentElement.scrollWidth<=innerWidth,'No document horizontal overflow');if(scroll)check(scroll.scrollWidth<=scroll.clientWidth,'No content horizontal overflow');
for(const card of document.querySelectorAll('.stat-card')){const num=card.querySelector('.num'),unit=card.querySelector('.stat-unit');check(num.scrollWidth<=card.clientWidth,'Numeric value fits card');if(unit)check(unit.getBoundingClientRect().bottom<card.querySelector('.label').getBoundingClientRect().top,'Unit does not overlap label');}
for(const dot of document.querySelectorAll('.footprint-svg circle')){const matrix=dot.getScreenCTM();check(parseFloat(dot.getAttribute('r'))*Math.hypot(matrix.a,matrix.b)<=4,'Footprint dot <= 4 screen px');}
if(result.view==='journeys'){
 const axis=document.querySelector('.tl-line').getBoundingClientRect();
 check([...document.querySelectorAll('.tl-name,.tl-year .y,.tl-month')].every(n=>{const r=document.createRange();r.selectNodeContents(n);return r.getBoundingClientRect().left>axis.right}),'Timeline text clears axis');
 check([...document.querySelectorAll('.tl-dot')].every(n=>Math.abs(n.getBoundingClientRect().left+n.getBoundingClientRect().width/2-axis.left)<1),'Timeline dots align with axis');
}
send();window.addEventListener('error',e=>{result.failures.push(e.message);send();});
