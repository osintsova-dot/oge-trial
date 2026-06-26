// sw.js — Service Worker тренажёра Speak & Smile.
// Стратегия: КОД (html/js/css/json) — network-first с обходом HTTP-кэша (online всегда свежая
// версия → лечит 10-мин кэш GitHub Pages; кэш = офлайн-фолбэк). АССЕТЫ (png/jpg/mp3/svg) —
// cache-first (не меняются). Чужие origin (воркеры, аудио ФИПИ) — не трогаем.
const CACHE = 'ss-cache-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

// --- Пуши «не теряй серию» ---
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  const url = d.url || './';
  const icon = url.indexOf('ege') >= 0 ? './assets/icon-ege-192.png' : './assets/icon-oge-192.png';
  e.waitUntil(self.registration.showNotification(d.title || 'Speak & Smile', {
    body: d.body || 'Не теряй серию — сделай раунд сегодня!',
    icon, badge: icon, tag: d.tag || 'streak', renotify: true,
    data: { url },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { try { await c.navigate(new URL(target, self.location.origin).href); } catch (err) {} return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // воркеры/ФИПИ-аудио/CDN — мимо

  const dest = req.destination;
  const isCode = dest === 'document' || dest === 'script' || dest === 'style'
    || url.pathname.endsWith('.json') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isCode) {
    // network-first: online → всегда свежее (no-store обходит кэш Pages); offline → из кэша
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) { const c = await caches.open(CACHE); c.put(req, fresh.clone()); }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw err;
      }
    })());
  } else {
    // ассеты — cache-first
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      if (fresh && fresh.ok) { const c = await caches.open(CACHE); c.put(req, fresh.clone()); }
      return fresh;
    })());
  }
});
