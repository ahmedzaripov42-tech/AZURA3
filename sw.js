/* AZURA Service Worker v15
   - Network-first for HTML/API (always fresh when online)
   - Stale-while-revalidate for assets (instant load + background update)
   - Precache shell on install; drop old caches on activate
   - skipWaiting + clients.claim for instant activation
   - Navigation preload for faster first paint
   - Range bypass for streaming
*/
const VERSION = 'azura-v15';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL = [
  './',
  './index.html',
  './azura.css?v=15',
  './azura-reborn.css?v=15',
  './azura-reborn-primary.css?v=15',
  './azura-mobile-performance-v10.css?v=15',
  './js/00-diagnostic.js?v=15',
  './js/01-core.js?v=15',
  './js/02-auth.js?v=15',
  './js/03-navigation.js?v=15',
  './js/08-premium-ui.js?v=15',
  './js/12-slider-footer.js?v=15',
  './js/azura-mobile-performance-v10.js?v=15',
  './js/azura-adapter-v9.js?v=15',
  './js/azura-clean-bridge-v9.js?v=15',
  './js/azura-reborn-ui.js?v=15',
  './js/azura-fixes-v15.js?v=15',
  './assets/logo.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await Promise.all(SHELL.map(async (url) => {
        try { await cache.add(new Request(url, { cache: 'reload' })); }
        catch (_) { /* single failure won't abort install */ }
      }));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))
    ),
    self.registration.navigationPreload &&
      self.registration.navigationPreload.enable().catch(() => {})
  ]).then(() => self.clients.claim()));
});

function isAsset(u) { return /\.(css|js|webp|png|jpg|jpeg|svg|ico|woff2?|ttf|otf)(\?|$)/i.test(u); }
function isHTML(r) { return r.mode === 'navigate' || (r.headers.get('accept') || '').includes('text/html'); }
function isAPI(u) { return u.pathname.startsWith('/api/'); }
function isMedia(u) { return u.pathname.startsWith('/media/'); }

async function networkFirst(req, cacheName, preload) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = (preload && await preload) || await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (_) {
    const c = await cache.match(req);
    if (c) return c;
    if (isHTML(req)) { const s = await caches.match('./index.html'); if (s) return s; }
    throw _;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fp = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => cached);
  return cached || fp;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !url.hostname.endsWith('r2.cloudflarestorage.com') && !url.hostname.endsWith('r2.dev')) return;
  if (req.headers.get('range')) return;

  if (isAPI(url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && (url.pathname === '/api/catalog' || url.pathname.startsWith('/api/catalog/')
          || url.pathname === '/api/chapters' || url.pathname === '/api/chapters/latest')) {
          const c = await caches.open(RUNTIME_CACHE); c.put(req, fresh.clone());
        }
        return fresh;
      } catch (_) {
        const c = await caches.match(req);
        if (c) return c;
        return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
    })());
    return;
  }
  if (isHTML(req)) { event.respondWith(networkFirst(req, RUNTIME_CACHE, event.preloadResponse)); return; }
  if (isMedia(url) || isAsset(url.pathname)) { event.respondWith(staleWhileRevalidate(req, ASSET_CACHE)); return; }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
