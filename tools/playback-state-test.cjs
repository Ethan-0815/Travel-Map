// Production orchestration regression; SVG painting requires browser checks.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={sleep:()=>Promise.resolve(),Map,Set};vm.createContext(context);
vm.runInContext(fs.readFileSync('js/map/mapView.js','utf8').replace(/^import .*;\r?$/gm,'').replace('export class MapView','class MapView')+';this.MapView=MapView;',context);
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(){
 const mv=new context.MapView({clientWidth:1024,clientHeight:844});
 const start={name:'Beijing',role:'start'},destination={name:'Shanghai',role:'destination'};
 mv.setJourneyPlaces(new Map([['a',[start,destination]],['b',[{...start,name:'Shanghai'},{...destination,name:'Guangzhou'}]]]));
 for(const id of ['a','b']){const [from,to]=mv._journeyPlaces(id);mv.routes.set(id,{run:0,legs:[{from,to,progress:0,parts:1,endsAtPlace:true}]});}
 mv.dimRoutesExcept=()=>{};mv.revealNode=()=>{};mv._legDuration=()=>1;mv.pulseNode=()=>Promise.resolve();mv._drawLeg=async leg=>{leg.progress=1;};
 mv.camera={cam:{k:1}};mv._updateLabels=()=>{};return mv;
}
(async()=>{
 let mv=setup();assert.equal(await mv.animateRoute('a'),true);assert.equal(mv.routes.get('a').legs[0].progress,1);assert.equal(mv._journeyWait,null);
 console.log('PASS one journey draws directly from start to destination');
 mv=setup();const playback=mv.playEnterGrowth([{id:'a',startDate:'2026-09-20'},{id:'b',startDate:'2026-09-23'}]);await tick();
 await playback;assert.equal(mv._journeyWait,null);
 assert.equal(mv.routes.get('b').legs[0].progress,1);assert.equal(mv.routes.get('a').legs[0].progress,1);
 console.log('PASS all journeys play sequentially without a hidden click; completed routes retained');
 const wait=mv.waitForJourneyContinue();mv.cancelRoutePlayback();assert.equal(await wait,false);
 mv=setup();const pulse=deferred();let pulses=0;mv.pulseNode=()=>++pulses===1?pulse.promise:Promise.resolve();
 const old=mv.animateRoute('a');await tick();const replacement=mv.animateRoute('b');pulse.resolve();assert.equal(await old,false);assert.equal(await replacement,true);
 console.log('PASS cancellation and replacement release old playback');
 const legacy=[{name:'Beijing',role:'start'},{name:'Nanjing',role:'waypoint'},{name:'Shanghai',role:'destination'}];
 mv.setJourneyPlaces(new Map([['legacy',legacy]]));assert.equal(mv._journeyPlaces('legacy').length,2);assert.equal(legacy.length,3);
 console.log('PASS legacy data stays untouched; main playback selects only endpoints');
})().catch(e=>{console.error(e);process.exitCode=1;});
