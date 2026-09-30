// Render the production MapPage/SettingsView against memory-only fixture data.
import { MapPage } from '../js/views/mapPage.js';
import { SettingsView } from '../js/views/settingsView.js';
import * as i18n from '../js/i18n/index.js';
import { el, icon } from '../js/utils/dom.js';
const journey={id:'visual-review',title:'北京 → 上海 → 广州',startDate:'2026-09-20',endDate:'2026-09-23'};
const places=[
  {name:'北京',lat:39.9042,lng:116.4074,role:'start'},
  {name:'上海',lat:31.2304,lng:121.4737,role:'waypoint'},
  {name:'广州',lat:23.1291,lng:113.2644,role:'destination'},
].map((p,seq)=>({...p,id:`visual-${seq}`,journeyId:journey.id,seq,country:'中国',arriveAt:`2026-09-${20+seq}`,photoIds:[]}));
const repo={state:{journeys:[journey],places},uniquePlaces:()=>places,placesByJourney:()=>places,stats:()=>({cities:3,countries:1,journeys:1,distance:2300})};
let settings;
const app={repo,i18n,t:i18n.t,pendingNewJourney:null,toast:()=>{},getTheme:()=>document.documentElement.dataset.theme,setTheme:theme=>{document.documentElement.dataset.theme=theme;},setLang:i18n.setLang};
const bar=el('nav',{class:'tabbar'});
bar.append(el('div',{class:'tabbar-pill'}));
app.router={go:name=>{if(name==='settings'){settings?.unmount();settings=new SettingsView(app);settings.mount(document.querySelector('#overlay'));bar.style.display='none';}},back:()=>{settings?.unmount();settings=null;bar.style.display='';}};
const page=new MapPage(app);
i18n.setLang('zh');
page.mount(document.querySelector('#views'));
for(const [name,label,handler] of [['map','地图',()=>{}],['journeys','重放历程',()=>page._openReplay()],['settings','设置',()=>app.router.go('settings')]]){
  bar.append(el('button',{class:`tabbar-item${name==='map'?' is-active':''}`,onclick:handler},[icon(name==='journeys'?'play':name,22),el('span',{},label)]));
}
document.querySelector('#app').append(bar);
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{document.documentElement.dataset.theme=button.dataset.mode;};
for(const button of document.querySelectorAll('[data-color]'))button.onclick=()=>{document.documentElement.dataset.accent=button.dataset.color;};
window.addEventListener('error',event=>{document.querySelector('#review-status').textContent=`ERROR: ${event.message}`;});
