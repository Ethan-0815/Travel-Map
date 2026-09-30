// data/repo.js — 数据仓库 + 内存 state + 派生选择器
import * as db from './db.js';
import { uuid } from '../utils/id.js';
import { emit, on } from '../core/eventbus.js';

// 内存 state
export const state = {
  settings: {},
  journeys: [],
  places: [],
  photos: [],
  loaded: false,
};

// ---- 设置 ----
export async function loadAll() {
  const [settings, journeys, places, photos] = await Promise.all([
    db.getAll('settings'),
    db.getAll('journeys'),
    db.getAll('places'),
    db.getAll('photos'),
  ]);
  state.settings = {};
  for (const s of settings) state.settings[s.key] = s.value;
  state.journeys = journeys.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  state.places = places.sort((a, b) => a.seq - b.seq);
  state.photos = photos;
  state.loaded = true;

  await migrateRoles();

  emit('data:changed');
}

/** 运行时迁移：为旧数据补齐 place.role（start/waypoint/destination） */
async function migrateRoles() {
  const missing = state.places.filter((p) => !p.role);
  if (!missing.length) return;
  const byJourney = new Map();
  for (const p of state.places) {
    if (!byJourney.has(p.journeyId)) byJourney.set(p.journeyId, []);
    byJourney.get(p.journeyId).push(p);
  }
  let changed = false;
  for (const list of byJourney.values()) {
    list.sort((a, b) => a.seq - b.seq);
    list.forEach((p, i) => {
      if (p.role) return;
      changed = true;
      if (list.length === 1) p.role = 'destination';
      else if (i === 0) p.role = 'start';
      else if (i === list.length - 1) p.role = 'destination';
      else p.role = 'waypoint';
    });
  }
  if (changed) await db.bulkPut('places', state.places);
}

export async function getSetting(key, def = null) {
  if (state.loaded) return state.settings[key] ?? def;
  const row = await db.get('settings', key);
  return row ? row.value : def;
}

export async function setSetting(key, value) {
  state.settings[key] = value;
  await db.put('settings', { key, value });
  // 设置变更不算数据变更，避免统计页无谓重渲染
  emit('settings:changed');
}

// ---- Journeys ----
export async function saveJourney(journey) {
  const now = new Date().toISOString();
  const rec = {
    ...journey,
    updatedAt: now,
    createdAt: journey.createdAt || now,
  };
  await db.put('journeys', rec);
  await reload();
  return rec;
}

export async function deleteJourney(id) {
  const connection = await db.default.open();
  await new Promise((resolve, reject) => {
    const tx = connection.transaction(['journeys', 'places', 'photos', 'blobs'], 'readwrite');
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('Journey deletion aborted'));
    tx.onerror = () => {}; // onabort reports the final transaction result.
    const placesRequest = tx.objectStore('places').getAll();
    placesRequest.onsuccess = () => {
      const places = placesRequest.result.filter(p => p.journeyId === id);
      const placeIds = new Set(places.map(p => p.id));
      const referenced = new Set(places.flatMap(p => p.photoIds || []));
      const photosRequest = tx.objectStore('photos').getAll();
      photosRequest.onsuccess = () => {
        const photos = photosRequest.result;
        const owned = photos.filter(p => p.journeyId === id || placeIds.has(p.placeId));
        const photoIds = new Set(owned.map(p => p.id));
        // Also remove legacy blobs referenced by a place without metadata.
        for (const photoId of referenced) {
          if (!photos.some(p => p.id === photoId)) photoIds.add(photoId);
        }
        tx.objectStore('journeys').delete(id);
        for (const placeId of placeIds) tx.objectStore('places').delete(placeId);
        for (const photoId of photoIds) {
          tx.objectStore('photos').delete(photoId);
          tx.objectStore('blobs').delete(photoId);
        }
      };
    };
  });
  await reload();
}

export async function savePlaces(journeyId, places) {
  // 全量替换该 journey 的地点
  const old = state.places.filter((p) => p.journeyId === journeyId);
  await db.bulkDel('places', old.map((p) => p.id));
  const rows = places.map((p, i) => ({
    ...p,
    id: p.id || uuid(),
    journeyId,
    seq: i,
  }));
  await db.bulkPut('places', rows);
  await reload();
}

/** Read-only diagnostic for a journey's persisted record and ordered places. */
export async function debugJourneySave(id) {
  const [journey, allPlaces] = await Promise.all([
    db.get('journeys', id),
    db.getAll('places'),
  ]);
  const places = allPlaces
    .filter((p) => p.journeyId === id)
    .sort((a, b) => a.seq - b.seq);
  const result = {
    id,
    journey: journey || null,
    places,
    start: places.find((p) => p.role === 'start') || null,
    destination: places.find((p) => p.role === 'destination') || null,
    dates: {
      journeyStart: journey?.startDate || null,
      journeyEnd: journey?.endDate || null,
      placeDates: places.map(({ role, name, arriveAt }) => ({ role, name, arriveAt: arriveAt || null })),
    },
    coordinates: places.map(({ role, name, lat, lng }) => ({ role, name, lat: lat ?? null, lng: lng ?? null })),
  };
  console.info('[debugJourneySave]', result);
  return result;
}

// ---- Photos ----
export async function savePhoto({ journeyId, placeId, blob, mime }) {
  const id = uuid();
  // 生成缩略图（最长边 640）
  const thumb = await makeThumb(blob, 640);
  await db.put('photos', {
    id,
    journeyId,
    placeId,
    mime,
    width: 0,
    height: 0,
    createdAt: new Date().toISOString(),
  });
  await db.put('blobs', { id, blob: thumb });
  // 更新 place.photoIds
  const place = state.places.find((p) => p.id === placeId);
  if (place) {
    place.photoIds = [...(place.photoIds || []), id];
    await db.put('places', place);
  }
  await reload();
  return id;
}

export async function deletePhoto(id) {
  const photo = state.photos.find((p) => p.id === id);
  if (photo) {
    const place = state.places.find((p) => p.id === photo.placeId);
    if (place) {
      place.photoIds = (place.photoIds || []).filter((x) => x !== id);
      await db.put('places', place);
    }
  }
  await db.del('photos', id);
  await db.del('blobs', id);
  await reload();
}

export async function getPhotoBlob(id) {
  const rec = await db.get('blobs', id);
  return rec ? rec.blob : null;
}

export function getPhotoUrl(id) {
  // 懒加载：返回 Promise<objectURL>
  return getPhotoBlob(id).then((blob) => (blob ? URL.createObjectURL(blob) : null));
}

async function makeThumb(blob, max) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale >= 1 && blob.size < 200 * 1024) return blob;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.82)
    );
    return out || blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

// ---- 派生选择器 ----
export function placesByJourney(journeyId) {
  return state.places
    .filter((p) => p.journeyId === journeyId)
    .sort((a, b) => a.seq - b.seq);
}

export function allPlacesChronological() {
  return [...state.places].sort((a, b) => {
    const da = a.arriveAt || a.visitedAt || '';
    const dbv = b.arriveAt || b.visitedAt || '';
    return da < dbv ? -1 : da > dbv ? 1 : a.seq - b.seq;
  });
}

export function uniquePlaces() {
  // 按名称+坐标去重，返回最近一次到访
  const map = new Map();
  for (const p of allPlacesChronological()) {
    const key = `${p.name}|${p.lat}|${p.lng}`;
    map.set(key, p);
  }
  return [...map.values()];
}

export function stats() {
  const journeys = state.journeys.length;
  const up = uniquePlaces();
  const cities = up.length;
  const countries = new Set(up.map((p) => p.country).filter(Boolean)).size;
  let distance = 0;
  for (const j of state.journeys) {
    const ps = placesByJourney(j.id);
    for (let i = 1; i < ps.length; i++) {
      distance += haversine(ps[i - 1], ps[i]);
    }
  }
  return { journeys, cities, countries, distance: Math.round(distance) };
}

export function journeyStats(journeyId) {
  const ps = placesByJourney(journeyId);
  const photos = state.photos.filter((p) => p.journeyId === journeyId).length;
  let distance = 0;
  for (let i = 1; i < ps.length; i++) distance += haversine(ps[i - 1], ps[i]);
  return { places: ps.length, photos, distance: Math.round(distance) };
}

function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 两地点间的大圆距离（公里），供 Stats Highlights 等外部计算使用 */
export function distanceBetween(a, b) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  return haversine(a, b);
}

async function reload() {
  await loadAll();
}

// 监听事件（供视图订阅）
export function subscribe(fn) {
  return on('data:changed', fn);
}

export default {
  state,
  loadAll,
  getSetting,
  setSetting,
  saveJourney,
  deleteJourney,
  savePlaces,
  debugJourneySave,
  savePhoto,
  deletePhoto,
  getPhotoUrl,
  placesByJourney,
  uniquePlaces,
  stats,
  journeyStats,
  distanceBetween,
  subscribe,
};
