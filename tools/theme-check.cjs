const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert/strict');
const hash = s => crypto.createHash('sha256').update(s).digest('hex').toUpperCase();
const baseline = JSON.parse(fs.readFileSync('tools/theme-baseline.json','utf8').replace(/^﻿/,''));
const allowed = ['js/map/mapView.js','js/replay/replayController.js','js/main.js','js/views/settingsView.js','js/i18n/zh.js','js/i18n/en.js','css/tokens.css','css/components.css','css/views.css'];
for (const file of baseline) {
  const path = file.Path.replaceAll('\\','/');
  const relative = path.split('/Travel Map/')[1];
  if (!allowed.includes(relative)) assert.equal(hash(fs.readFileSync(file.Path)),file.Hash,`Protected file changed: ${relative}`);
}
const mapPath='js/map/mapView.js';
const before = fs.readFileSync(mapPath,'utf8')
  .replace('保留距离曲线，播放速度提高 18%，不改变绘制与分段进度。','按地理距离绘制：短程约 2.5 秒，长程最多 5.4 秒。')
  .replace('return Math.min(5400, 2500 + km) / 1.18;', 'return Math.min(5400, 2500 + km);');
const mapBaseline=baseline.find(f=>f.Path.replaceAll('\\','/').endsWith(mapPath));
assert.equal(hash(before),mapBaseline.Hash,'Animation implementation changed beyond duration');
console.log('PASS: protected source files unchanged; animation changes limited to duration and comment.');
