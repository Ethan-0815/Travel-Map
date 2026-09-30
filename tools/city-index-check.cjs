const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const baseline=JSON.parse(fs.readFileSync('tools/city-ui-baseline.json','utf8'));
const current=fs.readFileSync('js/utils/cityIndex.js','utf8');
function load(source){const c={};vm.runInNewContext(source.replaceAll('export function','function')+';globalThis.entries=ENTRIES;globalThis.lookup=lookupCity;globalThis.search=searchCities;',c);return c;}
const old=load(baseline.find(f=>f.path==='js/utils/cityIndex.js').content),now=load(current);
assert.equal(current.slice(current.indexOf('// 构建条目与别名索引')),baseline[0].content.slice(baseline[0].content.indexOf('// 构建条目与别名索引')),'Search implementation unchanged');
for(const e of old.entries)assert.equal(JSON.stringify(now.lookup(e.name)),JSON.stringify(e),'Existing city changed: '+e.name);
for(const e of now.entries){
 assert(Number.isFinite(e.lat)&&Math.abs(e.lat)<=90&&Number.isFinite(e.lng)&&Math.abs(e.lng)<=180,e.name+' coordinates');
 assert(e.country&&e.countryZh&&e.name&&e.nameZh,e.name+' bilingual fields');
 assert.equal(now.lookup(e.name),e,e.name+' English alias collision');
 assert.equal(now.lookup(e.nameZh),e,e.name+' Chinese alias collision');
 assert(now.search(e.nameZh).includes(e),e.name+' Chinese search');
 assert(now.search(e.name).includes(e),e.name+' English search');
}
for(const [query,name,lat,lng] of [['景德镇','Jingdezhen',29.2687,117.1784],['tengchong','Tengchong',25.0207,98.4900],['阿尔山','Arxan',47.1771,119.9436],['KASHGAR','Kashgar',39.4704,75.9898],['釜山','Busan',35.1796,129.0756],['cusco','Cusco',-13.532,-71.9675],['皇后镇','Queenstown',-45.0312,168.6626]]){
 const e=now.lookup(query);assert.equal(e.name,name);assert.equal(e.lat,lat);assert.equal(e.lng,lng);
}
assert.equal(now.search('this-city-does-not-exist').length,0);
assert.equal(now.search('   ').length,0);
for(const f of baseline.filter(f=>f.path.startsWith('js/data/')||f.path.endsWith('statsView.js')))assert.equal(fs.readFileSync(f.path,'utf8'),f.content,'Protected file changed: '+f.path);
const form=baseline.find(f=>f.path.endsWith('journeyForm.js'));
assert.equal(fs.readFileSync(form.path,'utf8').replace("this.i18n.getLang() === 'zh' ? (m.countryZh || m.country) : m.country",'m.countryZh || m.country'),form.content,'Form changed beyond result display');
console.log(JSON.stringify({status:'PASS',original:old.entries.length,total:now.entries.length,added:now.entries.length-old.entries.length,china:now.entries.filter(e=>e.country==='China').length,international:now.entries.filter(e=>e.country!=='China').length,countriesAndRegions:new Set(now.entries.map(e=>e.country)).size,checks:['all bilingual searches','unique aliases','coordinate bounds','sample coordinates','unchanged original cities','unchanged search and save logic','unchanged data layer and statistics logic']},null,2));
