/* The Pharmacy — App Shell service worker
 * Strategies:
 *   - Navigations (pages):  network-first  -> page cache -> /offline
 *   - Hashed static assets: cache-first    (immutable)
 *   - Product images:       network-first  -> cache fallback
 *   - API GETs:             network-first  -> cache fallback (auth excluded)
 */
const VERSION = 'v2';
const C = {
  shell: 'tp-shell-' + VERSION,
  assets: 'tp-assets-' + VERSION,
  pages: 'tp-pages-' + VERSION,
  api: 'tp-api-' + VERSION,
};

const PRECACHE_URLS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(C.shell);
      // Cache the app shell; don't fail install if one item is unavailable
      await Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !Object.values(C).includes(k)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isImmutable(res) {
  return (res.headers.get('cache-control') || '').includes('immutable');
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok && request.method === 'GET' && !res.headers.get('set-cookie')) {
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const shell = await caches.open(C.shell);
      const fallback = await shell.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  // Only store genuinely immutable content (hashed build assets)
  if (res && res.ok && isImmutable(res)) {
    cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // same-origin only

  // 1) Page navigations -> network-first, offline fallback page
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, C.pages, '/offline'));
    return;
  }

  // Never cache auth/session endpoints
  if (url.pathname.startsWith('/api/auth/')) return;

  // 2) Hashed build assets -> cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/logo.svg'
  ) {
    event.respondWith(cacheFirst(request, C.assets));
    return;
  }

  // 3) Product images (originals + /_next/image optimized variants)
  //    -> network-first with cache fallback (fresh when online)
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/_next/image')) {
    event.respondWith(networkFirst(request, C.assets));
    return;
  }

  // 4) API data -> network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, C.api));
    return;
  }

  // Everything else (RSC payloads, etc.): plain network with best-effort cache
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        const shell = await caches.open(C.shell);
        return (await shell.match('/offline')) || Response.error();
      }
    })()
  );
});

/* Allow pages to trigger immediate SW updates */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
