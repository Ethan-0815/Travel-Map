import { StatsView } from '../js/views/statsView.js';
import * as repo from '../js/data/repo.js';
import * as i18n from '../js/i18n/index.js';
const journeys=[
 {id:'old',title:'江南春日 · 首次到访',startDate:'2025-03-01',endDate:'2025-03-05'},
 {id:'new',title:'再访上海 · 周末漫步',startDate:'2026-09-01',endDate:'2026-09-03'},
 {id:'empty',title:'一段没有照片的旅行',startDate:'2026-06-01',endDate:'2026-06-02'},
 {id:'undated',title:'没有日期的旅行'},
];
const places=[
 {id:'s1',journeyId:'old',name:'Shanghai',country:'China',lat:31.2304,lng:121.4737,arriveAt:'2025-03-01',role:'start',photoIds:['p1'],note:'沿着河边散步'},
 {id:'h1',journeyId:'old',name:'Hangzhou',country:'China',lat:30.2741,lng:120.1551,arriveAt:'2025-03-03',role:'waypoint',note:'西湖边喝茶'},
 {id:'s2',journeyId:'old',name:'上海',country:'中国',lat:31.2304,lng:121.4737,arriveAt:'2025-03-05',role:'destination',photoIds:['p1']},
 {id:'p1',journeyId:'new',name:'Paris',country:'France',lat:48.8566,lng:2.3522,arriveAt:'2026-09-01',role:'start'},
 {id:'s3',journeyId:'new',name:'Shanghai',country:'China',lat:31.2304,lng:121.4737,arriveAt:'2026-09-03',role:'destination'},
 {id:'j1',journeyId:'empty',name:'Jingdezhen',country:'China',lat:29.2687,lng:117.1784,role:'destination'},
 {id:'u1',journeyId:'undated',name:'Private place',country:'',lat:28,lng:118,role:'destination'},
].map((p,seq)=>({...p,seq}));
Object.assign(repo.state,{journeys,places,photos:[{id:'p1',placeId:'s1',journeyId:'old'},{id:'p2',placeId:'s3',journeyId:'new'}]});
window.sourceSnapshot=JSON.stringify(repo.state);
window.createdUrls=[];window.revokedUrls=[];window.photoDelay=0;window.photoMode='normal';
const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.revokedUrls.push(url);revoke(url);};
const app={repo:{...repo,getPhotoUrl:async id=>{
 await new Promise(r=>setTimeout(r,window.photoDelay));
 if(window.photoMode==='missing')return null;
 if(window.photoMode==='error')throw Error('Test missing blob');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${id==='p1'?'#a6c4cd':'#e3c9a7'}"/><path d="M0 180L70 90L130 145L180 80L240 170V240H0" fill="#597f7e"/><circle cx="180" cy="50" r="20" fill="#fff1cc"/></svg>`;
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));window.createdUrls.push(url);return url;
}},i18n,t:i18n.t,router:{go(){}}};
i18n.setLang('zh');
const view=new StatsView(app);view.mount(document.querySelector('#views'));window.reviewView=view;window.reviewRepo=repo;window.reviewI18n=i18n;
document.querySelector('#review').remove();document.querySelector('#review-status').remove();
window.reviewReady=true;
