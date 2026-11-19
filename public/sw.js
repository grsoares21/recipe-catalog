// Offline support: the app shell and photos are cache-first, catalog.json is network-first
// so new recipes show up as soon as there's a connection.
const CACHE = 'recipes-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  const networkFirst = url.pathname.endsWith('catalog.json') || event.request.mode === 'navigate';
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      if (networkFirst) {
        try {
          const res = await fetch(event.request);
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        } catch {
          return (await cache.match(event.request)) ?? Response.error();
        }
      }
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    }),
  );
});
