import { JourneyForm } from '../js/views/journeyForm.js';
import { MapPage } from '../js/views/mapPage.js';
import { JourneysView } from '../js/views/journeysView.js';
import { replayController } from '../js/replay/replayController.js';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok, message) => { if (!ok) throw Error(message); };
const until = async predicate => { for (let i = 0; i < 70; i++) { if (predicate()) return; await sleep(20); } throw Error('Transition timeout'); };
const input = (node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); };
const picker = () => document.querySelector('.stats-year-picker');
export async function run() {
  const logs = [];
  // All selection paths hold the menu open until its upward exit has completed.
  let root = picker(), trigger = root.querySelector('summary'), menu = root.querySelector('[role=menu]');
  trigger.click();
  check(root.open && menu.getAnimations()[0].effect.getTiming().duration === 220, 'Picker downward entry');
  await sleep(260);
  const option = [...menu.children].find(b => b.textContent === '2025');
  option.click();
  check(root.open && reviewView._year !== 2025, 'Selection waits for exit');
  check(menu.getAnimations()[0].effect.getKeyframes().at(-1).transform.includes('-8px'), 'Picker closes upward');
  await until(() => reviewView._year === 2025);
  root = picker(); trigger = root.querySelector('summary');
  trigger.click(); await sleep(70); trigger.click(); await sleep(40); trigger.click(); await sleep(270);
  check(root.open, 'Rapid reopen survives stale close');
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => !root.open);
  trigger.click(); await sleep(260); document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  check(root.open, 'Outside close waits for exit'); await until(() => !root.open);
  logs.push('year picker: down/up, deferred selection, rapid reversal, Escape and outside');

  reviewView._year = null; reviewView._render();
  const detail = reviewView.cityDetail;
  reviewView.scroll.scrollTop = 50;
  const top = reviewView.scroll.scrollTop;
  [...document.querySelectorAll('.stats-city-row')].find(b => b.textContent.includes('上海')).click();
  check(detail.dialog.getAnimations().find(a => a.animationName === 'city-detail-enter').effect.getTiming().duration === 280, 'Outer city duration unchanged');
  await until(() => !detail.dialog.classList.contains('is-entering'));
  detail.dialog.querySelector('.city-journey-row').click();
  check(!!detail.layerMotion && detail.animations.every(a => a.effect.getTiming().duration === 320), 'Nested layer entry 320ms');
  check(getComputedStyle(detail.dialog).opacity === '1', 'Glass stays visible');
  const heights = [];
  for (let i = 0; i < 5; i++) { heights.push(detail.dialog.getBoundingClientRect().height); await sleep(45); }
  check(new Set(heights.map(Math.round)).size > 2, 'Shell height interpolates');
  await until(() => !detail.layerMotion);
  detail.backButton.click(); await until(() => !!detail.layerMotion);
  check(detail.animations.slice(1).every(a => a.effect.getTiming().duration === 320), 'Nested return 320ms');
  check(!!detail.dialog.querySelector('.city-detail-outgoing .city-journey-route'), 'Outgoing journey remains visible');
  check(!!detail.content.querySelector('.city-journey-row') && !detail.dialog.inert, 'City reveals during return, not after it');
  await sleep(290);
  const nearEndHeight = detail.dialog.getBoundingClientRect().height;
  await until(() => !detail.layerMotion);
  check(Math.abs(detail.dialog.getBoundingClientRect().height - nearEndHeight) < 16, 'Return does not jump after photo load');
  check(detail.dialog.open && document.activeElement.matches('[data-journey-id]'), 'City restored with focus');
  detail.backButton.click(); await until(() => !detail.dialog.open);
  check(reviewView.scroll.scrollTop === top, 'Statistics position retained');
  logs.push('city/journey: continuous glass shell, animated height, simultaneous up/down layers, focus and scroll');

  const saved = {};
  const app = { i18n: reviewI18n, t: reviewI18n.t, router: { current: {}, go() {} }, toast: message => { throw Error(message); }, repo: {
    ...reviewRepo, saveJourney: async j => { saved.journey = j; }, savePlaces: async (id, rows) => { saved.places = rows; },
    debugJourneySave: async () => ({ journey: saved.journey, places: saved.places }),
  } };
  const form = new JourneyForm(app); form.mount(document.querySelector('#views'));
  const cityInput = role => form.root.querySelector(`[data-role=${role}] .city-search input`);
  const chip = (role, name) => [...form.root.querySelectorAll(`[data-role=${role}] .city-chip`)].find(b => b.textContent === name).click();
  chip('start', '北京'); check(form.nameInput.value === '', 'Start does not title journey');
  input(cityInput('destination'), '上海'); check(form.nameInput.value === '上海', 'Chinese typing');
  cityInput('destination').dispatchEvent(new Event('blur')); check(form.nameInput.value === '上海', 'Blur canonical title');
  input(cityInput('destination'), '东京'); form.destWrap.querySelector('.city-suggest-item').click();
  check(form.nameInput.value === '东京', 'Suggestion title');
  chip('destination', '上海'); check(form.nameInput.value === '上海', 'Chip updates automatic title');
  await form._save(); check(saved.journey.title === '上海' && saved.places.length === 2, 'Saved schema/title');
  input(form.nameInput, '我的假期'); chip('destination', '东京'); check(form.nameInput.value === '我的假期', 'Manual title retained');
  input(form.nameInput, ''); chip('destination', '香港'); check(form.nameInput.value === '', 'Manual clearing retained');
  form.unmount();
  reviewI18n.setLang('en');
  const english = new JourneyForm(app); english.mount(document.querySelector('#views'));
  const dest = english.destWrap.querySelector('.city-search input'); input(dest, 'Tokyo'); check(english.nameInput.value === 'Tokyo', 'English name');
  input(dest, 'My island'); check(english.nameInput.value === 'My island', 'Custom city'); english.unmount();
  app.router.current = { params: { id: 'old' } };
  const editing = new JourneyForm(app); editing.mount(document.querySelector('#views'));
  input(editing.destWrap.querySelector('.city-search input'), 'Tokyo');
  check(editing.nameInput.value === reviewRepo.state.journeys.find(j => j.id === 'old').title, 'Existing title retained'); editing.unmount();
  reviewI18n.setLang('zh');
  logs.push('title: typing/blur/search/chips, Chinese/English/custom, manual override, save, existing records');

  const map = createReplayMap();
  try {
    map.replayBtn.click();
    check(replayController.running && map.testCalls.includes('fit'), 'Click starts actual controller immediately');
    check(!map.root.querySelector('.replay-panel,.replay-bar,select'), 'No extra replay surfaces/confirmation');
    check(map.mapStage.getAnimations()[0].effect.getKeyframes()[0].translate.endsWith(' 18px'), 'Map replay enters upward');
    await until(() => !replayController.running);
    check(map.testCalls.filter(x => x.startsWith('route:')).join(',') === 'route:old,route:new', 'Dated routes play chronologically; single-place journeys do not interrupt playback');
    map.replayBtn.click(); await sleep(40); map.replayBtn.click();
    check(map.mapStage.getAnimations().length === 1, 'Repeat replay has only one intro');
    map.onHide(); await sleep(20);
    check(!replayController.running && !map.mapStage.getAnimations().length, 'Hide stops playback/intro');
    app.router.go = () => check(app.replayRequested === true, 'Replay flag precedes navigation');
    new JourneysView(app)._openReplay();
  } finally { disposeReplayMap(map); }
  check(JSON.stringify(reviewRepo.state) === sourceSnapshot, 'Fixture data unchanged');
  reviewView._render();
  logs.push('replay: direct start, no overlay/confirmation, chronological dates retained, upward intro, repeat/hide cleanup');
  return logs;
}
export async function reduced() {
  const root = picker(); root.querySelector('summary').click();
  check(root.querySelector('[role=menu]').getAnimations().length === 0, 'Reduced picker');
  root.querySelector('summary').click(); await sleep(0); check(!root.open, 'Reduced picker closes');
  const map = createReplayMap(); map._openReplay();
  check(map.mapStage.getAnimations().length === 0 && replayController.running, 'Reduced replay starts without intro');
  disposeReplayMap(map);
  const detail = reviewView.cityDetail;
  document.querySelector('.stats-city-row').click(); await sleep(0);
  detail.content.querySelector('.city-journey-row').click(); await sleep(40);
  check(!detail.layerMotion && !detail.dialog.querySelector('.city-detail-outgoing'), 'Reduced nested entry cleanup');
  detail.backButton.click(); await until(() => !detail.renderedMarker.journeyId); await sleep(40);
  check(!detail.layerMotion, 'Reduced return cleanup');
  detail.close(); await until(() => !detail.dialog.open);
  return 'PASS reduced motion';
}

// Production controller, with only map painting/camera replaced by memory spies.
function createReplayMap() {
  const map = new MapPage({ repo: reviewRepo, i18n: reviewI18n, t: reviewI18n.t });
  document.querySelector('#views').append(map.render());
  map.root.classList.add('view', 'is-active');
  map.mapStage.style.opacity = 1;
  map._mapReady = true;
  map.testCalls = [];
  map.mapView = {
    routes: new Map(reviewRepo.state.journeys.map(j => [j.id, {}])),
    _playbackEpoch: 0, camera: { cam: { k: 1 } },
    hideAllRoutes() { this._playbackEpoch++; },
    cancelRoutePlayback() { this._playbackEpoch++; },
    clearActive() {}, setFocusing() {}, resetRoutes() {}, _updateLabels() {},
    _journeyPlaces: id => reviewRepo.placesByJourney(id), _key: p => p.name,
    fitTo: async () => { map.testCalls.push('fit'); }, revealNode() {},
    animateRoute: async id => { map.testCalls.push('route:' + id); return true; },
    waitForJourneyContinue: () => { throw Error('Replay must not wait for a hidden click'); }, showAllRoutes() {},
  };
  return map;
}
function disposeReplayMap(map) { map._stopReplay(); map.root.remove(); map._unsubs.forEach(fn => fn()); }
export function prepareReplayTouch() {
  window.touchReplayMap = createReplayMap();
  const r = touchReplayMap.replayBtn.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
export function finishReplayTouch() {
  check(touchReplayMap.testCalls.includes('fit'), 'Native touch starts replay');
  check(!document.querySelector('.replay-panel,.replay-bar'), 'Native touch shows no overlay');
  disposeReplayMap(touchReplayMap);
  return 'PASS native mobile touch directly starts replay';
}

export async function stressDetail() {
  const detail = reviewView.cityDetail;
  document.querySelector('.stats-city-row').click();
  await until(() => !detail.dialog.classList.contains('is-entering'));
  detail.content.querySelector('.city-journey-row').click();
  await sleep(80); detail.backButton.click();
  await until(() => !detail.renderedMarker.journeyId);
  history.forward(); await until(() => !!detail.renderedMarker.journeyId);
  await until(() => !detail.layerMotion);
  check(detail.dialog.open && !detail.dialog.querySelector('.city-detail-outgoing'), 'Rapid Back/Forward cleanup');
  const bounds = detail.dialog.getBoundingClientRect();
  check(bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= 0 && bounds.bottom <= innerHeight + 1, 'Detail fits viewport');
  detail.backButton.click(); await until(() => !detail.layerMotion && !detail.renderedMarker.journeyId);
  check(document.activeElement.matches('[data-journey-id]'), 'Rapid return keeps focus');
  detail.content.querySelector('.city-journey-row').click();
  await sleep(60); detail.close(); await until(() => !detail.dialog.open);
  check(!detail.layerMotion && !detail.dialog.querySelector('.city-detail-outgoing'), 'Close during transition cleans snapshot');
  check(createdUrls.every(url => revokedUrls.includes(url)), 'All photo object URLs released');
  return 'PASS detail interruption, viewport bounds, photo cleanup';
}
