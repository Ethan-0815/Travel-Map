import { MapView } from '../js/map/mapView.js';
import { replayController } from '../js/replay/replayController.js';
const mv=new MapView(document.querySelector('#stage'));
await mv.init();
const report=document.querySelector('#report');
const points=[{name:'北京',lng:116.4074,lat:39.9042},{name:'广州',lng:113.2644,lat:23.1291},{name:'杭州',lng:120.1551,lat:30.2741},{name:'北京',lng:116.4074,lat:39.9042},{name:'大阪',lng:135.5023,lat:34.6937}];
const a={id:'qa-a'},b={id:'qa-b'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{const t=performance.now();while(!fn()){if(performance.now()-t>15000)throw Error('Timed out');await sleep(20);}};
let result;
function check(ok,label){if(!ok)throw Error(label);result.checks.push(label);report.textContent=JSON.stringify(result,null,2);}
let detailClicks=0;mv.onNodeClick=()=>detailClicks++;mv.onMapClick=()=>{};
function nodeClick(index){mv.nodes.get(mv._key(points[index])).g.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
function setup(){mv.hideAllRoutes();mv.setPlaces([...new Map(points.map(p=>[p.name,p])).values()]);mv.setJourneyPlaces(new Map([[a.id,points],[b.id,points.slice(0,3)]]));mv.setRoutes([a,b]);mv._setViewImmediate(points.map(p=>[p.lng,p.lat]));mv.entered=true;mv._growing=true;mv.resetForGrowth();mv.revealNode(mv._key(points[0]));}
document.querySelector('#run').onclick=async()=>{
 document.querySelector('#run').disabled=true;result={status:'RUNNING',checks:[],failures:[]};
 try{
  setup();
  const playback=mv.animateRoute(a.id,{reveal:true,dim:false});
  for(let i=0;i<4;i++){
   await until(()=>mv.routes.get(a.id).legs[i].progress>0.1);
   mv.setRoutes([a,b]);mv.resetRoutes();
   if(i===1){mv.root.style.width='85%';mv.resize();}
   if(i===2){mv.root.style.width='100%';mv.resize();}
   await until(()=>mv.routes.get(a.id).legs[i].progress===1);
   check(mv.routes.get(a.id).legs.slice(0,i+1).every(l=>l.progress===1 && l.line.style.visibility==='visible'),'Completed segments retained '+i);
   if(i<3){await until(()=>mv._segmentWait);await sleep(450);check(mv.routes.get(a.id).legs[i+1].progress===0,'Next segment waits '+i);nodeClick(i+1);}
  }
  await playback;check(detailClicks===0,'City click continues instead of opening detail');
  check(mv.routes.get(a.id).legs.every(l=>l.progress===1),'Four segments reach final destination');
  setup();const superseded=mv.animateRoute(a.id,{reveal:true,dim:false});await until(()=>mv._segmentWait);
  const replacement=mv.animateRoute(b.id,{reveal:true,dim:false});await until(()=>mv._segmentWait?.journeyId===b.id);
  check(await superseded===false,'Superseded playback resolves as cancelled');nodeClick(1);await replacement;
  check(mv.routes.get(b.id).legs.every(l=>l.progress===1),'Replacement owns continuation and completes');
  setup();const entering=mv.playEnterGrowth([a]);await until(()=>mv._activeDraw);
  const replay=replayController.start({mapView:mv,journeys:[a],repo:{placesByJourney:()=>points,state:{places:points.map(p=>({...p,journeyId:a.id}))}},onYear:()=>{}});
  for(let i=0;i<3;i++){await until(()=>mv._segmentWait?.index===i);nodeClick(i+1);}
  await replay;await entering;
  check(mv.routes.get(a.id).legs.every(l=>l.progress===1),'Replay replacing entry reaches every leg');
  check(!mv._growing&&[...mv.nodes.values()].every(n=>n.g.style.visibility==='visible'),'Replay reveals all nodes and releases growth state');
  result.status='PASS';
 }catch(e){result.status='FAIL';result.failures.push(e.message);}finally{report.textContent=JSON.stringify(result,null,2);document.querySelector('#run').disabled=false;}
};
window.addEventListener('error',e=>{report.textContent+='\nERROR '+e.message});
