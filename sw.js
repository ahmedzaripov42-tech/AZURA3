/* AZURA Service Worker v16 — FIX: API responses are never cached
   - Network-first for HTML (always fresh when online)
   - Stale-while-revalidate for static assets only
   - API (/api/*) responses: NEVER cached — always network-only
     (Worker sends Cache-Control: no-store; SW must honour it)
   - Media (/media/*): cache with revalidation (1h TTL)
   - Precache shell on install; drop old caches on activate
   - skipWaiting + clients.claim for instant activation
   - Navigation preload for faster first paint
   - Range bypass for streaming
*/
const VERSION = 'azura-v16';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL = [
  './',
  './index.html',
  './azura.css?v=16',
  './azura-reborn.css?v=16',
  './azura-reborn-primary.css?v=16',
  './azura-mobile-performance-v10.css?v=16',
  './js/00-diagnostic.js?v=16',
  './js/01-core.js?v=16',
  './js/02-auth.js?v=16',
  './js/03-navigation.js?v=16',
  './js/08-premium-ui.js?v=16',
  './js/12-slider-footer.js?v=16',
  './js/azura-mobile-performance-v10.js?v=16',
  './js/azura-adapter-v9.js?v=16',
  './js/azura-clean-bridge-v9.js?v=16',
  './js/azura-reborn-ui.js?v=16',
  './js/azura-fixes-v15.js?v=16',
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

  // FIX 6: API calls are NETWORK-ONLY — no caching whatsoever.
  // The worker already sends Cache-Control: no-store on every /api/* response.
  // Previously this SW was putting catalog + chapter responses into
  // RUNTIME_CACHE, meaning stale data survived even after the worker returned
  // fresh rows. The cache.put() calls are now removed entirely.
  if (isAPI(url)) {
    event.respondWith((async () => {
      try {
        // Always go to network. Add cache-busting headers to defeat any
        // intermediate proxy that ignores Cache-Control: no-store.
        const networkReq = new Request(req, {
          cache: 'no-store',
          headers: (() => {
            const h = new Headers(req.headers);
            h.set('cache-control', 'no-cache');
            h.set('pragma', 'no-cache');
            return h;
          })(),
        });
        return await fetch(networkReq);
      } catch (_) {
        // Offline fallback — never serve stale API data, always signal error
        return new Response(
          JSON.stringify({ error: 'offline', offline: true }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        );
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
