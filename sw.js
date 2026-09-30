// sw.js — Service Worker：在线优先更新，离线回退本地缓存
const CACHE = 'travel-map-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './css/tokens.css',
  './css/base.css',
  './css/map.css',
  './css/views.css',
  './css/components.css',
  './css/responsive.css',
  './vendor/d3/d3.min.js',
  './js/main.js',
  './assets/data/world-land.json',
  './assets/data/world-countries.json',
  './assets/data/china-provinces.json',
  './assets/data/china-nine-dash.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && e.request.url.startsWith(self.location.origin)) {
        const clone = res.clone();
        e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, clone)));
      }
      return res;
    }).catch(async () => (await caches.match(e.request)) || Response.error())
  );
});
