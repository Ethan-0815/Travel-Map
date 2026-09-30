// data/db.js — IndexedDB 封装
import { DB_NAME, DB_VERSION, STORES } from '../config.js';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // settings: key -> value
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      // journeys
      if (!db.objectStoreNames.contains('journeys')) {
        const s = db.createObjectStore('journeys', { keyPath: 'id' });
        s.createIndex('startDate', 'startDate');
      }
      // places
      if (!db.objectStoreNames.contains('places')) {
        const s = db.createObjectStore('places', { keyPath: 'id' });
        s.createIndex('journeyId', 'journeyId');
        s.createIndex('journeyId_seq', ['journeyId', 'seq']);
      }
      // photos (metadata only)
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('placeId', 'placeId');
        s.createIndex('journeyId', 'journeyId');
      }
      // blobs
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, stores, mode = 'readonly') {
  return db.transaction(stores, mode);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await open();
  return promisify(tx(db, store).objectStore(store).getAll());
}

export async function get(store, key) {
  const db = await open();
  return promisify(tx(db, store).objectStore(store).get(key));
}

export async function put(store, value) {
  const db = await open();
  return promisify(tx(db, store, 'readwrite').objectStore(store).put(value));
}

export async function bulkPut(store, values) {
  const db = await open();
  const t = tx(db, store, 'readwrite');
  const os = t.objectStore(store);
  values.forEach((v) => os.put(v));
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function del(store, key) {
  const db = await open();
  return promisify(tx(db, store, 'readwrite').objectStore(store).delete(key));
}

export async function bulkDel(store, keys) {
  const db = await open();
  const t = tx(db, store, 'readwrite');
  const os = t.objectStore(store);
  keys.forEach((k) => os.delete(k));
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function clear(store) {
  const db = await open();
  return promisify(tx(db, store, 'readwrite').objectStore(store).clear());
}

export async function getAllByIndex(store, index, value) {
  const db = await open();
  return promisify(tx(db, store).objectStore(store).index(index).getAll(value));
}

export default { open, getAll, get, put, bulkPut, del, bulkDel, clear, getAllByIndex };
