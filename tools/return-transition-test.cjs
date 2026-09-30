// DOM lifecycle stubs test routing order, not browser painting or layout.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const frames=[];
function element(){const classes=new Set();return {classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},style:{setProperty(){}},querySelectorAll:()=>[],getAnimations:()=>{const d=deferred();frames.push(d);return [{finished:d.promise,cancel:d.resolve}];}};}
class View {constructor(){this.el=element();this.mounted=true;} mount(){this.mounted=true;} unmount(){this.mounted=false;} onShow(){} onHide(){}}
const context={MapPage:View,JourneysView:View,StatsView:View,JourneyForm:View,SettingsView:View,location:{hash:''},history:{replaceState(){}},Promise};vm.createContext(context);
vm.runInContext(fs.readFileSync('js/router.js','utf8').replace(/^import .*;\r?$/gm,'').replace('export class Router','class Router')+'\nthis.Router=Router;',context);
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const finish=async()=>{frames.splice(0).forEach(d=>d.resolve());await tick();};
(async()=>{
 const router=new context.Router({});router.tabs={map:new View(),journeys:new View(),stats:new View()};router.tabbarEl=element();router.overlayEl=element();
 for(const name of ['settings','journeyForm']){
  router._openOverlay(name,{});const old=router.overlay;
  assert.ok(router.tabbarEl.inert);const closing=router.back();
  assert.equal(old.mounted,true,'Page stays mounted during exit');
  assert.ok(old.el.classList.contains('is-overlay-exiting'));
  assert.ok(router.tabbarEl.classList.contains('is-page-returning'));
  assert.equal(router.tabs.map.el.classList.contains('is-page-returning'), false, 'Main content must stay still');
  assert.equal(router.back(),closing,'Double back shares same exit');
  await finish();await closing;assert.equal(old.mounted,false);assert.equal(router.overlay,null);
  console.log('PASS '+name+' back: synchronized page/tabbar lifecycle');
 }
 router._openOverlay('journeyForm',{});const old=router.overlay;
 router.navigate('map',{}, {updateHash:false});assert.equal(old.mounted,true);
 await finish();assert.equal(old.mounted,false);console.log('PASS save destination navigation uses shared exit');
 router._openOverlay('settings',{});router.back();router._openOverlay('journeyForm',{});const current=router.overlay;
 await finish();assert.equal(router.overlay,current);assert.equal(current.mounted,true);assert.equal(router.tabbarEl.inert,true);
 console.log('PASS rapid reopen cannot be removed by previous exit');
 // Exercise the unchanged form save handler with delayed repository stubs.
 const saveJourney=deferred(),savePlaces=deferred();let navigated=false,placesCalled=false;
 const repo={saveJourney:()=>saveJourney.promise,savePlaces:()=>{placesCalled=true;return savePlaces.promise;},debugJourneySave:async()=>({journey:{},places:[]}),placesByJourney:()=>[]};
 const formContext={ViewBase:View,uuid:()=> 'qa-id',console:{info(){}},Number,JSON};vm.createContext(formContext);
 vm.runInContext(fs.readFileSync('js/views/journeyForm.js','utf8').replace(/^import .*;\r?$/gm,'').replace('export class JourneyForm','class JourneyForm')+'\nthis.JourneyForm=JourneyForm;',formContext);
 const form=new formContext.JourneyForm();form.app={repo,t:x=>x,toast:()=>{},router:{go:()=>{navigated=true;}}};form.nameInput={value:'Regression'};
 const points=[{role:'start',draft:{name:'Beijing',arriveAt:'2026-09-20',lat:'39.9042',lng:'116.4074',_photos:[]}},{role:'destination',draft:{name:'Guangzhou',arriveAt:'2026-09-23',lat:'23.1291',lng:'113.2644',_photos:[]}}];
 form._snapshotPlaces=()=>points;const saving=form._save();await tick();assert.equal(navigated,false);assert.equal(placesCalled,false);
 saveJourney.resolve();await tick();assert.equal(placesCalled,true);assert.equal(navigated,false);
 savePlaces.resolve();await saving;assert.equal(navigated,true);console.log('PASS return starts only after journey and places save succeed');
})().catch(e=>{console.error(e);process.exitCode=1;});

