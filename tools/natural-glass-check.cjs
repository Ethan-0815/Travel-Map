const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').toUpperCase();
const baseline=JSON.parse(fs.readFileSync('tools/natural-glass-baseline.json','utf8').replace(/^﻿/,''));
const allowed=['js/map/mapView.js','css/tokens.css','css/glass.css','css/components.css'];
for(const file of baseline){
  const name=file.Path.replaceAll('\\','/').split('/Travel Map/')[1];
  if(!allowed.includes(name))assert.equal(hash(fs.readFileSync(file.Path)),file.Hash,`Unexpected change: ${name}`);
}
const map=fs.readFileSync('js/map/mapView.js','utf8')
 .replace('在现有速度上再提高 18%','播放速度提高 18%')
 .replace('/ 1.18 / 1.18;','/ 1.18;');
assert.equal(hash(map),baseline.find(f=>f.Path.replaceAll('\\','/').endsWith('js/map/mapView.js')).Hash,'Changed animation implementation');
for(const file of ['css/tokens.css','css/glass.css']){
 const css=fs.readFileSync(file,'utf8');
 assert(!css.includes('linear-gradient'),'Fixed directional reflection remains');
 assert(!css.includes('--glass-highlight'),'Artificial highlight remains');
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'Unbalanced CSS');
}
console.log('PASS: protected code unchanged; animation duration only; no artificial glass gradients.');
