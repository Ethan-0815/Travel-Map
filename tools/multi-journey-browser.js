import { MapPage } from '../js/views/mapPage.js';
import { replayController } from '../js/replay/replayController.js';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok, message) => { if (!ok) throw Error(message); };
const until = async (predicate, label) => {
  const deadline = performance.now() + 35000;
  while (!predicate()) { if (performance.now() > deadline) throw Error('Timeout: ' + label + ' ' + JSON.stringify({hidden:document.hidden,running:replayController.running,growing:page?.mapView._growing,epoch:page?.mapView._playbackEpoch,wait:!!page?.mapView._journeyWait,routes:ids.map(id=>[id,page?.mapView.routes.get(id)?.legs.map(l=>l.progress)])})); await sleep(25); }
};
let page, seen;
const ids = ['a', 'b', 'c'];
function sample() {
  for (const id of ids) {
    const route = page?.mapView.routes.get(id);
    if (route?.legs.some(l => l.progress > 0 && l.progress < 1 && l.line.style.visibility === 'visible')) seen.add(id);
  }
  requestAnimationFrame(sample);
}
function allDrawn() { return ids.every(id => page.mapView.routes.get(id)?.legs.every(l => l.progress === 1)); }
async function verify(label) {
  await until(() => allDrawn() && !page.mapView._growing && !replayController.running, label);
  check(ids.every(id => seen.has(id)), label + ': every route must visibly animate, not just be revealed');
  check(!page.mapView._journeyWait, label + ': no hidden continuation wait');
  for (const id of ids) for (const leg of page.mapView.routes.get(id).legs) {
    check(leg.line.isConnected && leg.line.style.visibility === 'visible', label + ': connected visible SVG');
    check(leg.line.getAttribute('stroke-dasharray') === 'none', label + ': finished line');
  }
  check(page.root.querySelectorAll('.travel-head').length === 0, label + ': no orphan animation heads');
  check(!document.querySelector('.replay-panel,.replay-bar'), 'No replay confirmation overlays');
  return 'PASS ' + label + ': all three SVG routes animated and retained';
}
export async function setup(interrupt = false) {
  const coords = [[116.4074,39.9042],[121.4737,31.2304],[120.1551,30.2741],[118.7969,32.0603]];
  const names = ['Beijing','Shanghai','Hangzhou','Nanjing'];
  const journeys = [
    {id:'a',title:'First',startDate:'2026-01-01'},
    {id:'single',title:'Single place',startDate:'2026-01-02'},
    {id:'empty',title:'No places',startDate:'2026-01-03'},
    {id:'b',title:'Second',startDate:'2026-02-01'},
    {id:'c',title:'Third',startDate:'2026-03-01'},
  ];
  const places=ids.flatMap((id,i)=>[i,i+1].map((n,k)=>({id:id+k,journeyId:id,name:names[n],country:'China',lng:coords[n][0],lat:coords[n][1],seq:k,role:k?'destination':'start',arriveAt:'2026-01-01'})));
  places.push({...places[0],id:'single-place',journeyId:'single'});
  Object.assign(reviewRepo.state,{journeys,places,photos:[]});
  window.playbackSource=JSON.stringify(reviewRepo.state);
  reviewView.root.style.display='none';
  const app={repo:reviewRepo,i18n:reviewI18n,t:reviewI18n.t,router:{go(){}},toast(){}};
  page=new MapPage(app);seen=new Set();window.multiPage=page;
  page.mount(document.querySelector('#views'));
  sample();
  if (interrupt) {
    await until(()=>page.mapView.routes.get('a')?.legs.some(l=>l.progress>0.1 && l.progress<0.9),'initial first route');
    page.onHide();page.root.classList.remove('is-active');
    await sleep(200);
    check(!page.mapView._activeDraw && !page.mapView._growing,'Initial entry cancels on exit');
    seen=new Set();page.root.classList.add('is-active');page.onShow();
    return verify('leave during initial growth and reenter');
  }
  return verify('fresh entry including single-place and empty journeys');
}
export async function initialReenter() { return setup(true); }
export async function replay() { seen=new Set();page.replayBtn.click();return verify('direct replay'); }
export async function restart() {
  page.replayBtn.click();await sleep(150);seen=new Set();page.replayBtn.click();
  return verify('replay restarted during camera movement');
}
export async function reenter() {
  page.replayBtn.click();
  await until(()=>page.mapView.routes.get('a').legs.some(l=>l.progress>0.1 && l.progress<0.9),'mid first route');
  page.onHide();page.root.classList.remove('is-active');
  await sleep(200);check(!page.mapView._activeDraw && !page.mapView._growing && !replayController.running,'Leaving cancels drawing');
  seen=new Set();page.root.classList.add('is-active');page.onShow();
  const result=await verify('leave mid-playback and reenter');
  check(JSON.stringify(reviewRepo.state)===playbackSource,'Source records unchanged');
  return result;
}
