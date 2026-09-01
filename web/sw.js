/*
 * Service worker.
 *
 * Everything the app needs is precached at install time, so once ScratchJr is
 * installed it never needs the network again -- important for a school lab and
 * for a child using it on a plane. The precache list and the cache name are
 * substituted at build time; a new build produces a new cache name, which
 * evicts the old one on activation.
 */

const CACHE_NAME = '__CACHE_NAME__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // addAll() is all-or-nothing across ~1,000 files; cache them in batches
        // and tolerate individual misses so one bad asset cannot brick install.
        const BATCH = 40;
        for (let i = 0; i < PRECACHE.length; i += BATCH) {
            const batch = PRECACHE.slice(i, i + BATCH);
            await Promise.all(batch.map((url) =>
                cache.add(new Request(url, {cache: 'reload'})).catch(() => {})
            ));
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    // Range requests (the intro video seeking) must reach the network or the
    // browser gets a 200 where it expects a 206.
    if (request.headers.has('range')) {
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(request, {ignoreSearch: true});
        if (cached) {
            return cached;
        }
        try {
            const response = await fetch(request);
            if (response && response.ok && response.type === 'basic') {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
            }
            return response;
        } catch (e) {
            // Offline and not cached: fall back to the splash screen for
            // navigations so the app still opens.
            if (request.mode === 'navigate') {
                const fallback = await caches.match('index.html');
                if (fallback) {
                    return fallback;
                }
            }
            throw e;
        }
    })());
});
