// Browser regression fixture: imports production MapView, never accesses storage.
import { MapView } from '../js/map/mapView.js';
import { replayController } from '../js/replay/replayController.js';
import { initThemeColor } from '../js/core/themeColor.js';
initThemeColor();
const mv = new MapView(document.querySelector('#stage'));
const report = document.querySelector('#report');
const captures = document.querySelector('#captures');
const cities = [
  {name:'北京',lat:39.9042,lng:116.4074},
  {name:'上海',lat:31.2304,lng:121.4737},
  {name:'广州',lat:23.1291,lng:113.2644},
];
await mv.init();
mv.onMapClick = () => mv.resetRoutes();
window.addEventListener('resize', () => mv.resize());
let epoch = 0, state, previousPhase, phaseStart, pausedAt, samples, frames;
const journey = {id:'visual-regression',startDate:'2026-09-20'};
function check(ok, message) { if (!ok && !state.failures.includes(message)) state.failures.push(message); }
function snapshot(label) {
  const svg = mv.svg.cloneNode(true);
  svg.removeAttribute('class');
  svg.setAttribute('viewBox', `0 0 ${mv.width} ${mv.height}`);
  const fig = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = label; fig.append(caption,svg); captures.append(fig);
}
function paintReport() {
  const legs = mv.routes.get(journey.id)?.legs || [];
  report.textContent = JSON.stringify({...state, progress:legs.map(l=>+l.progress.toFixed(4)), waiting:!!mv._segmentWait},null,2);
}
function observe(run) {
  if (run !== epoch) return;
  const route = mv.routes.get(journey.id);
  const phase = mv._activeDraw ? route.legs.indexOf(mv._activeDraw.leg) : -1;
  const now = performance.now();
  if (phase !== previousPhase) {
    if (previousPhase >= 0) state.actualDurationMs.push(Math.round(now - phaseStart));
    if (phase >= 0) phaseStart = now;
    previousPhase = phase;
  }
  for (const [i,leg] of route.legs.entries()) {
    const p = leg.progress, length = leg.line.getTotalLength();
    check(p >= 0 && p <= 1, 'Progress outside 0..1');
    if (p === 0) check(getComputedStyle(leg.line).visibility === 'hidden' && getComputedStyle(leg.glow).visibility === 'hidden', 'Future leg visible');
    if (p === 1) check(leg.line.getAttribute('stroke-dasharray') === 'none', 'Completed leg is not solid');
    if (p > 0 && p < 1) {
      const drawn = length - Number(leg.line.getAttribute('stroke-dashoffset'));
      const tip = leg.line.getPointAtLength(drawn);
      const active = mv._activeDraw;
      check(!!active && active.leg === leg, 'Current leg lost its head');
      if (active) {
        const headMatrix = active.head.getCTM(), pathMatrix = leg.line.getCTM();
        const end = new DOMPoint(tip.x,tip.y).matrixTransform(pathMatrix);
        const error = Math.hypot(end.x-headMatrix.e,end.y-headMatrix.f);
        state.maxHeadErrorPx = Math.max(state.maxHeadErrorPx,error);
        check(error < 0.1, 'Head not at painted endpoint');
      }
      const dash = leg.line.getAttribute('stroke-dasharray').split(' ').map(Number);
      check(dash[0] >= length - 0.01 && dash[1] >= length - 0.01, 'Repeating dash pattern');
      check(getComputedStyle(leg.line).vectorEffect === 'none', 'Dash metric changes under zoom');
      if (i === 0 && p >= [0.25,0.5,0.75][frames]) { snapshot(`第一段 ${Math.round(p*100)}%`); frames++; }
    }
    check(p >= (samples[i] || 0), 'Progress regressed after redraw');
    samples[i] = p;
  }
  if (mv._segmentWait) {
    pausedAt ??= now;
    state.pauseObservedMs = Math.round(now-pausedAt);
    check(route.legs.slice(mv._segmentWait.index+1).every(l=>l.progress===0), 'Next leg started without click');
  }
  state.frames++;
  paintReport();
  requestAnimationFrame(()=>observe(run));
}
async function start(points, replay = false) {
  epoch++; mv.hideAllRoutes();
  captures.replaceChildren(); frames=0; samples=[]; previousPhase=-1; pausedAt=null;
  state={scenario:points.map(p=>p.name).join(' → '),status:'drawing',frames:0,maxHeadErrorPx:0,pauseObservedMs:0,actualDurationMs:[],failures:[]};
  mv.setPlaces(points); mv.setJourneyPlaces(new Map([[journey.id,points]]));
  mv.setJourneysById(new Map([[journey.id,journey]])); mv.setRoutes([journey]);
  mv.entered=true; mv._growing=true; mv.resetForGrowth();
  mv._setViewImmediate(points.map(p=>[p.lng,p.lat]));
  mv.revealNode(mv._key(points[0]));
  const run=epoch; requestAnimationFrame(()=>observe(run));
  if (replay) {
    // Observe real replay calls without replacing projection or animation.
    const originalReset = mv.resetView, originalFit = mv.fitTo;
    state.worldResets = 0; state.fitPoints = [];
    mv.resetView = function(...args) { state.worldResets++; return originalReset.apply(this,args); };
    mv.fitTo = function(points,opts) { state.fitPoints.push(points); return originalFit.call(this,points,opts); };
    for (const p of points) mv.revealNode(mv._key(p));
    try {
      await replayController.start({mapView:mv,journeys:[journey],repo:{placesByJourney:()=>points,state:{places:points.map(p=>({...p,journeyId:journey.id}))}},onYear:()=>{}});
      check(state.worldResets === 0, 'Replay zoomed out to world');
      check(JSON.stringify(state.fitPoints[0]) === JSON.stringify(points.map(p=>[p.lng,p.lat])), 'Replay did not fit every journey place');
    } finally { mv.resetView=originalReset;mv.fitTo=originalFit; }
  } else {
    await mv.animateRoute(journey.id,{dim:false,reveal:true});
  }
  if(run!==epoch)return;
  mv._growing=false; state.status=state.failures.length?'FAIL':'PASS'; paintReport();
}
document.querySelector('#three').onclick=()=>start(cities);
const replayButton=document.createElement('button');
replayButton.textContent='重放聚焦验证';
replayButton.onclick=()=>start(cities,true);
document.querySelector('#checks > div').append(replayButton);
document.querySelector('#two').onclick=()=>start([cities[0],cities[2]]);
document.querySelector('#redraw').onclick=()=>{mv.setRoutes([journey]);mv.resetRoutes();};
document.querySelector('#resize').onclick=()=>{
  start(cities);
  const run=epoch;
  setTimeout(()=>{if(run===epoch){mv.root.style.right='20%';mv.resize();state.resizeTest=true;}},1200);
  setTimeout(()=>{if(run===epoch){mv.root.style.right='0';mv.resize();mv.setRoutes([journey]);mv.resetRoutes();}},2300);
};
window.addEventListener('error',e=>{if(state){state.failures.push(e.message);paintReport();}});
report.textContent='Ready — choose a route, then click blank map after Shanghai.';
