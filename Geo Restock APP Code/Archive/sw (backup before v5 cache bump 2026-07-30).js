// GEO Restock service worker — offline caching of app shell, catalog, and images.
importScripts('config.js'); // one config for page and worker alike
const CFG = self.GEO_CONFIG;
// BUMP THIS ON EVERY PUSH THAT CHANGES config.js, index.html OR THE CATALOG.
// Both config.js and the catalog file are in SHELL below, so they are precached
// under this exact name. The activate sweep only deletes caches whose name is
// DIFFERENT from this one — so if the name doesn't change, every device keeps
// serving the OLD copies forever and a push appears to do nothing. A restart
// does not help: the service worker answers from cache before the network is
// ever consulted. That is not a theory; it is what happened twice.
//   v2 (2026-07-26): dropped the precached MP3
//   v3 (2026-07-26): moved logo + Krypton artwork to GitHub hosting
//   v4 (2026-07-28): Solar/Krypton trailer tiles + parts 630-640 in the catalog
const CACHE = 'geo-restock-2-0-v4';
// AUDIO REMOVED 2026-07-26: the MP3 (6.5 MB) was precached here, so EVERY device
// downloaded it on every service-worker install whether or not anyone played it.
// That was the Netlify bandwidth bleed. The artwork still rides offline.
// The artwork is fetched from GITHUB (CFG.assetBase), not Netlify — precaching
// it here used to pull 1.27 MB off the hosting plan on every install. addAll is
// wrapped in a .catch by the install handler, so a cross-origin hiccup can never
// break the shell.
const ASSET = n => (CFG.assetBase ? CFG.assetBase + encodeURIComponent(n) : './' + n);
const SHELL = ['./', './index.html', './config.js', './' + CFG.catalogFile,
  ASSET(CFG.krypton.image)];
// 2.0: the catalog carries no image URLs — derive them (base + Part ID + ext).
const imageUrls = parts => [...new Set(parts.map(p => CFG.imageBase + p['Part ID'] + CFG.imageExt))];
const IMAGE_FETCH_CONCURRENCY = 6; // avoid bursting ~350 requests at GitHub at once

// Only cache a response we've actually verified succeeded — an unverified/opaque
// cache entry can permanently "poison" an image slot with an error page.
async function fetchAndCache(cache, url) {
  try {
    const res = await fetch(url);
    if (res && res.ok) { await cache.put(url, res.clone()); return true; }
  } catch (err) { /* network error — leave uncached, retried on next view */ }
  return false;
}

// Fetch a list of URLs a few at a time instead of all at once.
async function cacheAllThrottled(cache, urls, limit = IMAGE_FETCH_CONCURRENCY) {
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      await fetchAndCache(cache, url);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, urls.length) }, worker));
}

// On install: cache the shell + catalog, then pre-cache every part image.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL).catch(() => {});
    try {
      const res = await fetch('./' + CFG.catalogFile, { cache: 'no-store' });
      const env = await res.json();
      await cacheAllThrottled(cache, imageUrls(env.Parts || []));
    } catch (err) { /* offline or catalog missing — runtime caching will fill in */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

// Cache-first for shell, catalog, and images; everything else hits the network
// (Firebase realtime traffic is never cached). Falls back to cache when offline.
// Manual / weekly refresh: page posts {type:'REFRESH'} → re-pull catalog + images.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'REFRESH') {
    e.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch('./' + CFG.catalogFile, { cache: 'no-store' });
        if (res && res.ok) {
          await cache.put('./' + CFG.catalogFile, res.clone());
          const env = await res.json();
          await cacheAllThrottled(cache, imageUrls(env.Parts || []));
        }
      } catch (err) { /* offline */ }
      const cs = await self.clients.matchAll();
      cs.forEach(c => c.postMessage({ type: 'REFRESHED' }));
    })());
  }
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const isShell = SHELL.some(s => url.pathname.endsWith(s.replace('./', '/')) || url.pathname.endsWith(s.replace('./', '')));
  const isImage = /raw\.githubusercontent\.com/.test(url.host) || /\.(jpg|jpeg|png|webp|gif)$/i.test(url.pathname);

  if (isShell || isImage) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) {
        // revalidate in the background; waitUntil keeps the worker alive long enough to finish
        e.waitUntil(fetchAndCache(cache, req));
        return hit;
      }
      try {
        const r = await fetch(req);
        if (r && r.ok) cache.put(req, r.clone());
        return r;
      } catch (err) {
        return hit || Response.error();
      }
    })());
  }
});
