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

/**
 * Pages and code change with every build; artwork and sounds do not.
 *
 * Serving code from the cache first means a device keeps running an old build
 * until the next service worker takes over, which is a whole extra visit late.
 * These go to the network first and fall back to the cache when offline, so an
 * update lands as soon as the device sees it and the app still opens when it
 * does not.
 */
function isPageOrCode (url) {
    return url.pathname === '/' ||
        url.pathname === '/app/' ||
        /\.(html|js|json|webmanifest)$/.test(url.pathname);
}

async function cachePut (request, response) {
    if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    }
    return response;
}

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
        if (isPageOrCode(url)) {
            try {
                return await cachePut(request, await fetch(request));
            } catch (e) {
                const cached = await caches.match(request, {ignoreSearch: true});
                if (cached) {
                    return cached;
                }
                // Fall through to the shared offline handling below.
            }
        }

        const cached = await caches.match(request, {ignoreSearch: true});
        if (cached) {
            return cached;
        }
        try {
            return await cachePut(request, await fetch(request));
        } catch (e) {
            // Offline and not cached. Fall back within the same part of the
            // site: a navigation inside the app must never land on the landing
            // page, or the installed app shows an install prompt -- and the
            // landing page's own redirect back into the app then loops.
            if (request.mode === 'navigate') {
                const fallback = url.pathname.startsWith('/app/')
                    ? await caches.match('/app/index.html')
                    : await caches.match('/index.html');
                if (fallback) {
                    return fallback;
                }
            }
            throw e;
        }
    })());
});
