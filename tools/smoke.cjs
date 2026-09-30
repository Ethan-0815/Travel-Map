// 核心地图逻辑冒烟测试（Node，无浏览器）
const d3 = require('../vendor/d3/d3.min.js');
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'assets', 'data');
function load(n) { return JSON.parse(fs.readFileSync(path.join(DATA, n), 'utf8')); }

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('  ✗', msg); }
  else console.log('  ✓', msg);
}

const width = 1200, height = 700;
const fit = d3.geoNaturalEarth1();
fit.fitExtent([[8, 8], [width - 8, height - 8]], { type: 'Sphere' });
const baseScale = fit.scale();
const proj = d3.geoNaturalEarth1().scale(baseScale).translate([0, 0]);
const geoPath = d3.geoPath(proj);

// 数据
const land = load('world-land.json');
const countries = load('world-countries.json');
const china = load('china-provinces.json');
const nineDash = load('china-nine-dash.json');
assert(china.features.length === 34, `中国省级 feature = 34（实际 ${china.features.length}）`);
assert(nineDash.features.length === 1, '九段线存在');
const names = china.features.map((f) => f.properties.name);
assert(names.includes('台湾省'), '含台湾省');
assert(names.includes('香港特别行政区'), '含香港特别行政区');
assert(names.includes('澳门特别行政区'), '含澳门特别行政区');
// 世界国界不含 China/Taiwan
const adm0 = new Set(countries.features.map((f) => f.properties.ADM0_A3));
assert(!adm0.has('CHN') && !adm0.has('TWN'), '世界国界已剔除 China/Taiwan');

// 路径生成有限且非空
let ok = true;
for (const f of land.features) { if (!geoPath(f)) ok = false; }
assert(ok, `陆地路径全部有效（${land.features.length} features）`);
ok = true;
for (const f of countries.features) { if (!geoPath(f)) ok = false; }
assert(ok, `国界路径全部有效（${countries.features.length} features）`);
ok = true;
for (const f of china.features) { if (!geoPath(f)) ok = false; }
assert(ok, '中国省份路径全部有效');

// 经纬网
assert(typeof d3.geoGraticule10 === 'function', 'd3.geoGraticule10 存在');
assert(geoPath(d3.geoGraticule10()).length > 0, '经纬网路径非空');

// 路线：北京 → 东京（大圆插值 + 反子午线检测）
const interp = d3.geoInterpolate([116.4074, 39.9042], [139.6503, 35.6762]);
const pts = [];
for (let i = 0; i <= 128; i++) pts.push(interp(i / 128));
let maxJump = 0;
for (let i = 1; i < pts.length; i++) maxJump = Math.max(maxJump, Math.abs(pts[i][0] - pts[i - 1][0]));
assert(maxJump < 180, `北京→东京 无跨反子午线（最大经度跳变 ${maxJump.toFixed(2)}°）`);
for (const p of pts) {
  const xy = proj(p);
  assert(Number.isFinite(xy[0]) && Number.isFinite(xy[1]), `投影有限 (${p[0].toFixed(2)},${p[1].toFixed(2)})`);
}

// 跨太平洋路线（旧金山 → 东京）应被切分
const interp2 = d3.geoInterpolate([-122.4194, 37.7749], [139.6503, 35.6762]);
const pts2 = [];
for (let i = 0; i <= 128; i++) pts2.push(interp2(i / 128));
let jumps = 0;
for (let i = 1; i < pts2.length; i++) if (Math.abs(pts2[i][0] - pts2[i - 1][0]) > 180) jumps++;
assert(jumps > 0, `旧金山→东京 检测到反子午线切分（${jumps} 处）`);

// 相机 flyTo 数学
const target = proj([121.4737, 31.2304]); // Shanghai
const k = 5;
const tx = width / 2 - target[0] * k;
const ty = height / 2 - target[1] * k;
assert(Number.isFinite(tx) && Number.isFinite(ty), 'flyTo 目标 translate 有限');

console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
