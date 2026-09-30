// Read-only city summaries. Nothing here writes to persisted journey/place records.
import { lookupCity } from './cityIndex.js';
import { distanceBetween } from '../data/repo.js';
import { parseDate } from './date.js';

const normalize = value => String(value || '').trim().toLowerCase();
const hasCoordinates = p => p.lat !== null && p.lat !== '' && p.lng !== null && p.lng !== '' &&
  Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));

export function cityIdentity(place) {
  const name = String(place.city || place.name || '').trim();
  const hit = lookupCity(name);
  const country = normalize(place.country);
  // Do not turn a custom Paris in another country into Paris, France.
  if (hit && (!country || [hit.country, hit.countryZh].some(c => normalize(c) === country)) &&
      (!hasCoordinates(place) || distanceBetween(place, hit) < 80)) {
    return { key: JSON.stringify([hit.name, hit.country]), ...hit };
  }
  return {
    key: JSON.stringify([normalize(name), country, place.lat ?? '', place.lng ?? '']),
    name, nameZh: name, country: place.country || '', countryZh: place.country || '',
  };
}

export function visitDate(place, journey) {
  return [place.arriveAt, place.visitedAt, journey?.startDate]
    .find(value => typeof value === 'string' && parseDate(value)) || null;
}

export function placePhotoIds(repo, places) {
  const placeIds = new Set(places.map(p => p.id).filter(Boolean));
  const photos = repo.state.photos || [];
  const byId = new Map(photos.map(p => [p.id, p]));
  const ids = new Set();
  for (const place of places) {
    for (const id of place.photoIds || []) {
      const metadata = byId.get(id);
      if (!metadata?.placeId || placeIds.has(metadata.placeId)) ids.add(id);
    }
  }
  for (const photo of photos) if (placeIds.has(photo.placeId)) ids.add(photo.id);
  return [...ids];
}

export function collectCityVisits(repo, journeys = repo.state.journeys) {
  const cities = new Map();
  for (const journey of journeys) {
    for (const place of repo.placesByJourney(journey.id)) {
      const identity = cityIdentity(place);
      if (!identity.name) continue;
      if (!cities.has(identity.key)) cities.set(identity.key, {
        ...identity, places: [], journeys: new Map(), dates: [],
      });
      const city = cities.get(identity.key);
      city.places.push(place);
      city.journeys.set(journey.id, journey);
      const date = visitDate(place, journey);
      if (date) city.dates.push(date);
    }
  }
  return [...cities.values()].map(city => {
    city.dates.sort((a, b) => parseDate(a) - parseDate(b));
    return {
      ...city, journeys: [...city.journeys.values()], count: city.journeys.size,
      firstVisit: city.dates[0] || null,
      lastVisit: city.dates.at(-1) || null,
      photoIds: placePhotoIds(repo, city.places),
    };
  });
}

export function cityLabel(city, locale) {
  return {
    name: locale === 'zh' ? city.nameZh : city.name,
    country: locale === 'zh' ? city.countryZh : city.country,
  };
}
