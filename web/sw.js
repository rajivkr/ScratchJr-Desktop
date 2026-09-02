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

// The pages and code needed to open the app: a few hundred kilobytes.
const SHELL = __SHELL__;

// Everything else -- artwork, sounds, sample projects, the intro video.
const REST = __REST__;

/** Cache a list of URLs in batches, tolerating individual failures. */
async function cacheAll (cache, urls, reload) {
    const BATCH = 40;
    for (let i = 0; i < urls.length; i += BATCH) {
        const batch = urls.slice(i, i + BATCH);
        await Promise.all(batch.map((url) =>
            cache.add(reload ? new Request(url, {cache: 'reload'}) : url).catch(() => {})
        ));
    }
}

/*
 * Install caches the shell only, then activates.
 *
 * This used to precache all 34MB before calling skipWaiting, which meant no
 * service worker controlled the page until every sprite and sound had been
 * downloaded. A browser will not treat a site as installable until a worker
 * with a fetch handler is in control -- so on a real connection the install
 * offer never arrived, and the first load sat there while the whole asset
 * library came down. On a fast local disk it finished in a second, which is
 * why it looked fine in development.
 */
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cacheAll(cache, SHELL, true);
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

        // The rest fills in behind the app, which is usable immediately and
        // caches anything it touches through the fetch handler anyway.
        const cache = await caches.open(CACHE_NAME);
        cacheAll(cache, REST, false).catch(() => {});
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
            // Offline and not cached: fall back to whichever front door this
            // navigation was heading for -- the app's splash inside /app/,
            // the landing page anywhere else.
            if (request.mode === 'navigate') {
                const home = url.pathname.startsWith('/app/') ? '/app/index.html' : '/index.html';
                const fallback = await caches.match(home);
                if (fallback) {
                    return fallback;
                }
            }
            throw e;
        }
    })());
});
