// tools/seedTestData.mjs — 测试数据注入（供各 e2e 测试脚本复用）
// 注入两条标准旅程（含 role），标题避开「旧 Demo 清理名单」（East Asia · 2019 / Europe · 2021）
// 用法：await ev(SEED_EXPR)  —— 在已打开 travel-map 数据库的页面里执行

export const CLEAR_EXPR = `(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  for (const s of ['journeys','places','photos','blobs','settings']) await new Promise((res) => { const rq = db.transaction(s,'readwrite').objectStore(s).clear(); rq.onsuccess = res; });
  db.close();
})()`;

// 清库重试（新 profile 下 app 尚未建库时 NotFoundError，轮询）
export async function clearWithRetry(ev, sleep, retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await ev(CLEAR_EXPR);
      return true;
    } catch {
      await sleep(1500);
    }
  }
  return false;
}

// 标准测试数据：Asia 4 城 + Europe 3 城（7 城市 5 国家 2 旅程 ~4315km）
export const SEED_EXPR = `(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('travel-map'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = db.transaction(['journeys','places'],'readwrite');
  const now = new Date().toISOString();
  const j1 = { id: 'seed-asia', title: 'Test Asia 2019', subtitle: '', startDate: '2019-06-03', endDate: '2019-06-12', description: '', coverColor: '#e09b57', createdAt: now, updatedAt: now };
  const j2 = { id: 'seed-europe', title: 'Test Europe 2021', subtitle: '', startDate: '2021-08-14', endDate: '2021-08-24', description: '', coverColor: '#7d8fb3', createdAt: now, updatedAt: now };
  tx.objectStore('journeys').put(j1);
  tx.objectStore('journeys').put(j2);
  const ps = tx.objectStore('places');
  const P = (id, journeyId, name, country, lat, lng, date, seq, role) =>
    ps.put({ id, journeyId, name, city: name, country, lat, lng, arriveAt: date + 'T09:00', departAt: null, note: '', photoIds: [], seq, role });
  P('sa1', 'seed-asia', 'Beijing', 'China', 39.9042, 116.4074, '2019-06-03', 0, 'start');
  P('sa2', 'seed-asia', 'Shanghai', 'China', 31.2304, 121.4737, '2019-06-05', 1, 'waypoint');
  P('sa3', 'seed-asia', 'Hangzhou', 'China', 30.2741, 120.1551, '2019-06-07', 2, 'waypoint');
  P('sa4', 'seed-asia', 'Tokyo', 'Japan', 35.6762, 139.6503, '2019-06-10', 3, 'destination');
  P('se1', 'seed-europe', 'Paris', 'France', 48.8566, 2.3522, '2021-08-14', 0, 'start');
  P('se2', 'seed-europe', 'Zurich', 'Switzerland', 47.3769, 8.5417, '2021-08-18', 1, 'waypoint');
  P('se3', 'seed-europe', 'Rome', 'Italy', 41.9028, 12.4964, '2021-08-22', 2, 'destination');
  await new Promise((res) => { tx.oncomplete = res; });
  db.close();
})()`;

// rAF shim（addScriptToEvaluateOnNewDocument 用）
export const RAF_SHIM_SOURCE = `window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);`;
