import * as repo from '../js/data/repo.js';
import * as db from '../js/data/db.js';
import { SettingsView } from '../js/views/settingsView.js';
import { JourneysView } from '../js/views/journeysView.js';
import { on } from '../js/core/eventbus.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const check = (ok, msg) => { if (!ok) throw Error(msg); };
const until = async fn => { for (let i = 0; i < 100; i++) { if (fn()) return; await sleep(20); } throw Error('Timed out'); };
const snapshot = async () => JSON.stringify(await Promise.all(['journeys', 'places', 'photos', 'blobs', 'settings'].map(s => db.getAll(s))));
let settings, timeline, calls = 0, updates = 0;
export async function setup() {
  // This runner always uses a fresh, isolated browser profile. Refuse nonempty DBs.
  check((await db.getAll('journeys')).length === 0 && (await db.getAll('blobs')).length === 0, 'Isolated empty test database');
  await db.bulkPut('journeys', [
    { id: 'delete-me', title: '上海 · 春日旅行', startDate: '2026-03-01', endDate: '2026-03-05' },
    { id: 'keep-me', title: '保留的上海旅行', startDate: '2025-08-01', endDate: '2025-08-02' },
  ]);
  await db.bulkPut('places', [
    { id: 'start-delete', journeyId: 'delete-me', name: 'Beijing', country: 'China', lat: 39.9, lng: 116.4, role: 'start', seq: 0, arriveAt: '2026-03-01' },
    { id: 'dest-delete', journeyId: 'delete-me', name: 'Shanghai', country: 'China', lat: 31.23, lng: 121.47, role: 'destination', seq: 1, arriveAt: '2026-03-05', photoIds: ['photo-delete', 'orphan'] },
    { id: 'dest-keep', journeyId: 'keep-me', name: 'Shanghai', country: 'China', lat: 31.23, lng: 121.47, role: 'destination', seq: 0, arriveAt: '2025-08-02', photoIds: ['photo-keep'] },
  ]);
  await db.bulkPut('photos', [
    { id: 'photo-delete', journeyId: 'delete-me', placeId: 'dest-delete' },
    { id: 'legacy-delete', placeId: 'dest-delete' },
    { id: 'photo-keep', journeyId: 'keep-me', placeId: 'dest-keep' },
  ]);
  await db.bulkPut('blobs', ['photo-delete', 'legacy-delete', 'orphan', 'photo-keep'].map(id => ({ id, blob: new Blob(['fixture']) })));
  await db.put('settings', { key: 'testSetting', value: 'preserved' });
  await repo.loadAll();
  const app = { repo: { ...repo, deleteJourney: async id => { calls++; return repo.deleteJourney(id); } },
    i18n: reviewI18n, t: reviewI18n.t, getTheme: () => document.documentElement.dataset.theme,
    router: { back() {} }, toast: message => { window.deleteToast = message; },
  };
  timeline = new JourneysView(app); timeline.mount(document.querySelector('#views'), { activate: false });
  settings = new SettingsView(app); settings.mount(document.querySelector('#overlay'));
  on('data:changed', () => updates++);
  window.deleteSettings = settings;
  await sleep(300);
  check(settings.scroll.textContent.includes('旅行足迹'), 'Settings category');
}
export async function openList() {
  settings.scroll.querySelector('.settings-delete-entry').click();
  const flow = settings.deleteJourneys;
  await until(() => flow.page.open && !flow.motions.size);
  check(flow.list.querySelectorAll('button').length === repo.state.journeys.length, 'All journeys listed');
  check(flow.list.textContent.includes('2026') && flow.list.textContent.includes('上海'), 'Name and dates');
}
export async function confirmFirst() {
  const flow = settings.deleteJourneys;
  flow.list.querySelector('[data-journey-id="delete-me"]').click();
  await until(() => flow.confirm.open && !flow.motions.size);
  check(flow.confirm.textContent.includes('确定删除这次旅行吗？删除后该旅行的城市、地点、时间线、照片及相关数据都会一起删除，且无法恢复。'), 'Exact warning');
  check(document.activeElement === flow.cancel, 'Cancel gets initial focus');
}
export async function exercise() {
  const flow = settings.deleteJourneys;
  const before = await snapshot();
  flow.cancel.click();
  await until(() => flow.motions.get(flow.confirm)?.visible === false);
  check(flow.confirm.open && flow.confirm.inert, 'Confirmation remains mounted for exit animation');
  await until(() => !flow.confirm.open && !flow.motions.size);
  check(await snapshot() === before && calls === 0, 'Cancel never deletes');
  flow.back.click();
  await until(() => flow.motions.get(flow.page)?.visible === false);
  check(flow.page.open, 'Selection page retains return animation');
  await until(() => !flow.page.open);
  await openList(); await confirmFirst();
  const originalDelete = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function(key) {
    if (this.name === 'blobs' && key === 'orphan') { this.transaction.abort(); return; }
    return originalDelete.call(this, key);
  };
  try {
    flow.remove.click(); flow.remove.click();
    await until(() => !!flow.error.textContent && !flow.busy);
    check(calls === 1, 'Repeated confirm guarded');
    check(await snapshot() === before, 'Aborted transaction rolls back every store');
    check(updates === 0, 'Failure does not publish changed data');
  } finally { IDBObjectStore.prototype.delete = originalDelete; }
  flow.remove.click();
  await until(() => !flow.page.open && !flow.confirm.open);
  check(calls === 2 && updates === 1, 'Successful deletion emits one refresh');
  check((await db.getAll('journeys')).map(j => j.id).join() === 'keep-me', 'Target journey removed');
  check((await db.getAll('places')).map(p => p.id).join() === 'dest-keep', 'Only target places removed');
  check((await db.getAll('photos')).map(p => p.id).join() === 'photo-keep', 'Photo metadata including legacy relation removed');
  check((await db.getAll('blobs')).map(p => p.id).join() === 'photo-keep', 'Photo blobs and orphan reference removed');
  check((await db.get('settings', 'testSetting')).value === 'preserved', 'Settings unchanged');
  check(repo.stats().journeys === 1 && repo.stats().cities === 1, 'Stats recomputed, shared city retained');
  check(!timeline.root.textContent.includes('2026') && timeline.root.textContent.includes('2025'), 'Timeline immediately refreshed');
  check(reviewView._targets[0].to === 1, 'Mounted statistics refreshed');
  check(!!settings.scroll.querySelector('.settings-delete-entry'), 'Returned to settings');
  settings.scroll.querySelector('.settings-delete-entry').click();
  await until(() => flow.page.open && !flow.motions.size);
  flow.list.querySelector('button').click(); await until(() => flow.confirm.open && !flow.motions.size);
  flow.remove.click(); await until(() => !flow.page.open);
  check(!settings.scroll.querySelector('.settings-delete-entry') && settings.scroll.textContent.includes('暂无旅行记录'), 'Empty settings have no delete action');
  check((await db.getAll('blobs')).length === 0 && repo.state.places.length === 0, 'Last journey cleans all data');
  return 'PASS cancel, atomic rollback, duplicate protection, associated data cleanup, live stats/timeline, return and empty state';
}
export function bounds() {
  const flow = settings.deleteJourneys;
  for (const node of [flow.page, flow.confirm]) {
    const r = node.getBoundingClientRect();
    check(r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, 'Dialog viewport bounds');
    check(node.scrollWidth <= node.clientWidth + 1, 'No horizontal overflow');
  }
}
export async function reducedEmpty() {
  const flow = settings.deleteJourneys;
  flow.open(settings.head.querySelector('button'));
  await until(() => flow.page.open && !flow.motions.size);
  check(!flow.list.querySelector('button') && flow.list.textContent.includes('暂无旅行记录'), 'Empty selector contains no delete action');
  flow.back.click(); await until(() => !flow.page.open);
  return 'PASS reduced-motion page return and empty selector';
}
