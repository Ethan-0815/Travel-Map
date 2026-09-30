import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { collectCityVisits, cityIdentity, cityLabel } from '../js/utils/cityVisits.js';

const journeys = [
  { id: 'a', startDate: '2025-02-01' },
  { id: 'b', startDate: '2026-03-01' },
  { id: 'missing' },
];
const places = [
  { id: '1', journeyId: 'a', name: 'Shanghai', country: 'China', lat: 31.2304, lng: 121.4737, arriveAt: '2025-02-02', photoIds: ['photo1', 'photo1', 'elsewhere'] },
  { id: '2', journeyId: 'a', name: '上海', country: '中国', lat: 31.2304, lng: 121.4737, arriveAt: '2025-02-05', role: 'destination' },
  { id: '3', journeyId: 'b', name: 'Shanghai', country: 'China', lat: 31.2304, lng: 121.4737, arriveAt: 'invalid', photoIds: ['photo2'] },
  { id: '4', journeyId: 'b', name: 'Paris', country: 'USA', lat: 33.66, lng: -95.55 },
  { id: '5', journeyId: 'b', name: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  { id: '6', journeyId: 'missing', name: 'Private place', country: '', lat: null, lng: null },
  { id: '7', journeyId: 'orphan', name: 'Unlinked city' },
];
const photos = [{ id: 'photo1', placeId: '1' }, { id: 'photo3', placeId: '2' }, { id: 'elsewhere', placeId: '4' }];
const repo = { state: { journeys, places, photos }, placesByJourney: id => places.filter(p => p.journeyId === id) };
const before = JSON.stringify(repo.state);
const cities = collectCityVisits(repo);
assert.equal(cities.length, 4);
const shanghai = cities.find(c => c.name === 'Shanghai');
assert.equal(shanghai.count, 2, 'A round trip through the same city counts once');
assert.equal(shanghai.places.length, 3, 'Keep all visits for dates and photos');
assert.equal(shanghai.firstVisit, '2025-02-02');
assert.equal(shanghai.lastVisit, '2026-03-01', 'Invalid arrival falls back to journey date');
assert.deepEqual(shanghai.photoIds.sort(), ['photo1', 'photo2', 'photo3']);
assert.deepEqual(cityLabel(shanghai, 'zh'), { name: '上海', country: '中国' });
assert.deepEqual(cityLabel(shanghai, 'en'), { name: 'Shanghai', country: 'China' });
assert.equal(cities.filter(c => c.name === 'Paris').length, 2, 'Same name in different countries stays separate');
assert.notEqual(cityIdentity({ name: 'Paris', lat: 33.66, lng: -95.55 }).key, cityIdentity(places[4]).key, 'Faraway coordinates do not inherit the catalog identity');
assert.equal(cities.find(c => c.name === 'Private place').firstVisit, null);
assert.equal(collectCityVisits(repo, [journeys[0]])[0].count, 1, 'Year-filtered list uses only the selected journeys');
assert.deepEqual(collectCityVisits({ state: { journeys: [] }, placesByJourney: () => [] }), []);
assert.equal(JSON.stringify(repo.state), before, 'Summaries never mutate records');
for (const { path, hash } of JSON.parse(readFileSync('tools/city-detail-baseline.json', 'utf8'))) {
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash, `Protected file: ${path}`);
}
console.log('PASS: aliases, country/coordinate identity, repeat visits, date fallback, missing dates, photo ownership/deduplication, scoped list, immutable records and protected files.');
