const CACHE_NAME = 'ritm-dnya-neon-v4.4';
const ASSETS = ['./', './index.html', './style.css', './script.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Каждый файл кэшируем отдельно: если иконки ещё не загружены, остальное всё равно закэшируется
  // (addAll падал целиком при любом 404 — и офлайн-режим не работал вообще).
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Только GET своего домена; всё остальное (shortcuts://, внешние API) не трогаем
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        // ignoreSearch: офлайн открытие ссылки вида /?sleep=8&steps=5000 должно находить index.html
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});
