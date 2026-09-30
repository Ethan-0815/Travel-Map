import { StatsView } from '../js/views/statsView.js';
import { SettingsView } from '../js/views/settingsView.js';
import * as repo from '../js/data/repo.js';
import * as i18n from '../js/i18n/index.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const pause=()=>new Promise(r=>setTimeout(r,1050));
const data={journeys:[{id:'a',title:'春日江南',startDate:'2026-03-01'},{id:'b',title:'秋日远行',startDate:'2026-09-01'},{id:'c',title:'去年旅行',startDate:'2025-01-01'}],places:[
 {journeyId:'a',name:'上海',lat:31.23,lng:121.47,country:'中国'},
 {journeyId:'a',name:'杭州',lat:30.27,lng:120.15,country:'中国'},
 {journeyId:'b',name:'上海',lat:31.23,lng:121.47,country:'中国'},
 {journeyId:'b',name:'巴黎',lat:48.86,lng:2.35,country:'法国'},
 {journeyId:'c',name:'东京',lat:35.68,lng:139.69,country:'日本'},
].map((p,seq)=>({...p,seq,id:String(seq)}))};
Object.assign(repo.state,data);
const original=JSON.stringify(data);
const app={repo,i18n,t:i18n.t,router:{go(){}},getTheme:()=>document.documentElement.dataset.theme,setTheme:t=>document.documentElement.dataset.theme=t,setLang:i18n.setLang};
i18n.setLang('zh');
const view=new StatsView(app);view.mount(document.querySelector('#views'));
const select=y=>{const s=view.scroll.querySelector('select');s.value=y;s.dispatchEvent(new Event('change'));};
const numbers=()=>[...view.scroll.querySelectorAll('.num')].map(x=>x.textContent);
window.checkLayout=()=>{const r=view.scroll.getBoundingClientRect();const overflow=[...view.scroll.querySelectorAll('.stat-card,.highlight,.heat-cell,.stats-year-select')].some(e=>{const b=e.getBoundingClientRect();return b.right>r.right+1||b.left<r.left-1;});assert(!overflow,'Horizontal overflow');return {width:innerWidth,overflow};};
try{
 await pause();
 assert([...view.scroll.querySelectorAll('.stats-section')].map(x=>x.textContent).join('|')==='旅行热度|旅行洞察|精彩瞬间|旅行时间线|旅行足迹','Section order');
 assert([...view.scroll.querySelectorAll('option')].map(x=>x.value).join(',')===',2026,2025','Actual years only');
 assert(numbers().slice(0,3).join(',')==='4,3,3','All totals');
 select('2025');await pause();assert(numbers().slice(0,3).join(',')==='1,1,1','Historical totals');
 assert(!view.scroll.textContent.includes('春日江南'),'Unselected journeys leaked');
 assert(view.scroll.querySelectorAll('.heat-cell[data-level="4"]').length===1,'Historical heat');
 select('2026');await pause();assert(numbers().slice(0,3).join(',')==='3,2,2','Current totals');
 assert(view.scroll.querySelector('.stats-insights').textContent.includes('2 次旅程'),'City frequency');
 assert(view.scroll.querySelector('.stats-insights').textContent.includes('秋日远行'),'Latest journey');
 select('');assert(JSON.stringify(data)===original,'Source records mutated');
 const layout=window.checkLayout();
 Object.assign(repo.state,{journeys:[],places:[]});view._render();await pause();
 assert(numbers().join(',')==='0,0,0,0','Empty totals');assert(!view.scroll.querySelector('select'),'Fake years');assert(!view.scroll.querySelector('.highlight'),'Fake insights');
 Object.assign(repo.state,data);view._render();
 const settings=new SettingsView(app);settings.mount(document.querySelector('#overlay'));
 assert(settings.scroll.querySelector('.language-control').textContent==='中文/English','Language choices');
 settings.scroll.querySelector('[role="switch"]').click();assert(i18n.getLang()==='en','Switch to English');
 assert(settings.scroll.querySelector('[role="switch"]').getAttribute('aria-checked')==='false','Switch state');
 view.onShow();assert(view.head.textContent==='Your Journey','English statistics');
 settings.unmount();i18n.setLang('zh');view.onShow();
 window.reviewResult={status:'PASS',checks:['order','year filtering','totals','insights','heat','empty state','language switch','immutable records'],layout};
 document.querySelector('#review-status').textContent='内存测试数据 · 不写入数据库';
}catch(error){window.reviewResult={status:'FAIL',error:error.stack};}
