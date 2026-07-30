// GEO Restock service worker — offline cache for the app shell, the catalog and
// the part images.
//
// REBUILT 2026-07-30. The old worker had ONE lever: a hand-edited CACHE constant
// whose NAME was the version. Bumping it did not update the cache, it DESTROYED
// the cache and rebuilt from zero — 1.39 MB of catalog off the Netlify plan plus
// 11 MB of images off GitHub, on every device, for a one-character code fix. And
// forgetting to bump it meant a push silently did nothing at all. That happened
// twice. Full history and reasoning: md/GEO_Catalog_Architecture.md, the
// 2026-07-30 service-worker entries.
//
// WHAT REPLACED IT
//   * The PAGE decides what is stale, at every app open, after first paint. It
//     reads three independent stamps out of Netlify's version.json and compares
//     them to what it has. This worker owns no version logic at all — it stores
//     and serves. One brain, not two arguing.
//   * FOUR caches, and the split is the whole point:
//       geo-meta            one pointer entry naming the live shell/data caches
//       geo-shell-<stamp>   index.html + config.js. Swapped atomically.
//       geo-data-<stamp>    the catalog. Swapped atomically.
//       geo-images          NEVER VERSIONED. NEVER SWEPT. Fetched once, kept
//                           forever, topped up when new Part IDs appear.
//     Part images are addressed by Part ID and their content never changes, so
//     nothing about a code release should ever cost an image download. DO NOT
//     wire geo-images to a stamp. That is how the 11 MB re-download comes back.
//   * NO skipWaiting, NO clients.claim. A new shell is applied on the NEXT
//     launch, never swapped under a technician mid-job.
//   * NO time-based anything. There is no clock in this app.
//
// STANDING RULE, load-bearing: every stamp read and every pull uses
// cache:'no-store'. Without it the browser's own HTTP cache can answer a
// revalidation and the worker faithfully re-stores stale bytes — it revalidates
// forever and never gets anything new. That is the most likely true cause of the
// 2026-07-28 "the push did nothing" incident.
importScripts('config.js');
const CFG = self.GEO_CONFIG;

const META = 'geo-meta';
const IMAGES = 'geo-images';
const PTR = '/__geo_current';           // synthetic key: the worker's pointer
const SHELL_PREFIX = 'geo-shell-';
const DATA_PREFIX = 'geo-data-';
const IMAGE_FETCH_CONCURRENCY = 6;      // don't burst ~570 requests at GitHub

// The catalog now lives on GITHUB, not Netlify (2026-07-30). Built the same way
// the images and the logo are.
const CATALOG_URL = CFG.assetBase
  ? CFG.assetBase + encodeURIComponent(CFG.catalogFile)
  : './' + CFG.catalogFile;
const SHELL_URLS = ['./', './index.html', './config.js'];
const imageUrl = id => CFG.imageBase + id + CFG.imageExt;

// ── POINTER ───────────────────────────────────────────────────────────────────
// Which shell/data cache is live. Kept in the Cache API rather than in a worker
// variable because a worker is killed and restarted constantly and would forget.
async function readPointer() {
  try {
    const c = await caches.open(META);
    const r = await c.match(PTR);
    if (r) return await r.json();
  } catch (e) { /* first run */ }
  return {};
}
async function writePointer(ptr) {
  const c = await caches.open(META);
  await c.put(PTR, new Response(JSON.stringify(ptr), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

// ── CACHING HELPERS ───────────────────────────────────────────────────────────
// Only ever cache a response we have verified succeeded. An unverified or opaque
// entry can permanently poison a slot with an error page — which is why this
// checks res.ok before put() and returns false rather than throwing.
async function fetchAndCache(cache, url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res && res.ok) { await cache.put(url, res.clone()); return true; }
  } catch (err) { /* network error — leave uncached, retried later */ }
  return false;
}

// Fetch a list a few at a time instead of all at once.
async function fetchAllThrottled(cache, urls, limit = IMAGE_FETCH_CONCURRENCY) {
  let i = 0, done = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      if (await fetchAndCache(cache, url)) done++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, urls.length) }, worker));
  return done;
}

// ── INSTALL / ACTIVATE ────────────────────────────────────────────────────────
// Install does NOT precache images any more — that is what made every worker
// change cost 11 MB per device. It seeds the shell so the app can open offline
// after its very first visit, and nothing else.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const ptr = await readPointer();
    if (ptr.shell) return;                       // already seeded; page owns updates
    const name = SHELL_PREFIX + 'bootstrap';
    const cache = await caches.open(name);
    await Promise.all(SHELL_URLS.map(u => fetchAndCache(cache, u)));
    await writePointer(Object.assign(ptr, { shell: 'bootstrap' }));
  })());
});

// Sweep ONLY superseded shell/data caches. geo-images and geo-meta are never
// touched here — deleting geo-images is the exact mistake this rebuild exists to
// stop. Note there is no skipWaiting: a new worker waits for every tab to close.
self.addEventListener('activate', e => {
  e.waitUntil((async () => { await migrateLegacyCache(); await sweep(); })());
});

// ONE-TIME MIGRATION off the old single-cache worker (names like
// 'geo-restock-2-0-v5'). It is worth doing properly rather than just deleting:
// that old cache holds all ~570 part images, already downloaded. RESCUING them
// into geo-images makes this changeover cost a phone roughly nothing instead of
// 11 MB, and because geo-images is never swept they are then kept for good.
// Harmless and a no-op on any device that has already migrated.
async function migrateLegacyCache() {
  try {
    const keys = await caches.keys();
    const legacy = keys.filter(k => k.indexOf('geo-restock-') === 0);
    if (!legacy.length) return;
    const images = await caches.open(IMAGES);
    for (const name of legacy) {
      const old = await caches.open(name);
      const reqs = await old.keys();
      for (const req of reqs) {
        if (CFG.imageBase && req.url.indexOf(CFG.imageBase) === 0) {
          if (!(await images.match(req.url))) {
            const res = await old.match(req);
            if (res && res.ok) await images.put(req.url, res.clone());
          }
        }
      }
      await caches.delete(name);
    }
  } catch (err) { /* migration is best-effort; a miss costs a re-download, not correctness */ }
}

async function sweep() {
  const ptr = await readPointer();
  const live = [SHELL_PREFIX + ptr.shell, DATA_PREFIX + ptr.data];
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(k => (k.startsWith(SHELL_PREFIX) || k.startsWith(DATA_PREFIX)) && live.indexOf(k) === -1)
    .map(k => caches.delete(k)));
}

// ── MESSAGES FROM THE PAGE ────────────────────────────────────────────────────
// The page has already fetched, VERIFIED and stored anything new; these are
// housekeeping asks, not decisions.
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'SWEEP') e.waitUntil(sweep());
  // Top up images for Part IDs we do not hold yet. Because geo-images is never
  // swept this is a one-time cost per part, for the life of the phone — a device
  // that is already full does ~570 cache lookups and zero downloads.
  if (d.type === 'TOPUP_IMAGES' && Array.isArray(d.ids)) {
    e.waitUntil((async () => {
      const cache = await caches.open(IMAGES);
      const missing = [];
      for (const id of d.ids) {
        const u = imageUrl(id);
        if (!(await cache.match(u))) missing.push(u);
      }
      const added = missing.length ? await fetchAllThrottled(cache, missing) : 0;
      const cs = await self.clients.matchAll();
      cs.forEach(c => c.postMessage({ type: 'TOPUP_DONE', checked: d.ids.length, added: added }));
    })());
  }
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
// Cache-FIRST and deliberately NOT stale-while-revalidate. The old worker
// revalidated in the background on every hit, which is what let a stale HTTP
// response get re-stored forever. Freshness is now the page's job, once per
// launch, against a stamp. Anything not matched here (Firebase traffic above all)
// goes straight to the network untouched.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // version.json is the freshness question itself and must NEVER be cached.
  if (url.pathname.endsWith('/' + CFG.versionFile)) return;

  const isCatalog = req.url === CATALOG_URL || url.pathname.endsWith('/' + CFG.catalogFile);
  const isImage = CFG.imageBase && req.url.indexOf(CFG.imageBase) === 0;
  const isShell = url.origin === self.location.origin &&
    (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/config.js'));

  if (!isCatalog && !isImage && !isShell) return;

  e.respondWith((async () => {
    if (isImage) {
      const cache = await caches.open(IMAGES);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && r.ok) cache.put(req.url, r.clone());   // lazy fill, no revalidation
        return r;
      } catch (err) { return Response.error(); }
    }

    const ptr = await readPointer();
    const name = isCatalog ? DATA_PREFIX + ptr.data : SHELL_PREFIX + ptr.shell;
    try {
      const cache = await caches.open(name);
      const hit = await cache.match(isCatalog ? CATALOG_URL : req);
      if (hit) return hit;
    } catch (err) { /* no such cache yet — fall through to the network */ }

    try { return await fetch(req); } catch (err) { return Response.error(); }
  })());
});
