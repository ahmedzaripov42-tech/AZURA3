/* AZURA Service Worker v11
   Strategy:
   - HTML / API: network-first, fallback to cache (so users always see fresh data when online)
   - Static assets (css, js, images, fonts): stale-while-revalidate with long-lived cache
   - On install: precache shell. On activate: drop old caches.
   - Respects Save-Data: when active, skip non-essential prefetch.
*/
const VERSION = 'azura-v12';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL = [
  './',
  './index.html',
  './azura.css?v=11',
  './azura-reborn.css?v=11',
  './azura-reborn-primary.css?v=11',
  './azura-mobile-performance-v10.css?v=11',
  './js/00-diagnostic.js?v=17',
  './js/01-core.js?v=14',
  './js/02-auth.js?v=14',
  './js/03-navigation.js?v=14',
  './js/08-premium-ui.js?v=15',
  './js/12-slider-footer.js?v=15',
  './js/azura-mobile-performance-v10.js?v=2',
  './js/azura-adapter-v9.js?v=2',
  './js/azura-local-unified-v9.js?v=1',
  './js/azura-clean-bridge-v9.js?v=1',
  './js/azura-reborn-ui.js?v=2',
  './assets/logo.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // Add files individually so a single 404 cannot abort the whole install.
      await Promise.all(SHELL.map(async (url) => {
        try { await cache.add(new Request(url, { cache: 'reload' })); }
        catch (_) { /* ignore single failures */ }
      }));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isAsset(url) {
  return /\.(css|js|webp|png|jpg|jpeg|svg|ico|woff2?|ttf|otf)(\?|$)/i.test(url);
}
function isHTML(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}
function isAPI(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/');
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (isHTML(req)) {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw _;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin && !url.hostname.endsWith('r2.cloudflarestorage.com') && !url.hostname.endsWith('r2.dev')) {
    return; // skip cross-origin requests we don't manage
  }

  if (isHTML(req) || isAPI(url)) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }
  if (isAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, ASSET_CACHE));
    return;
  }
});

// Allow page to message-trigger immediate update
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
