/*
 * PWA entry point.
 *
 * Replaces src/electronClient.js. It installs a browser-backed `window.tablet`,
 * registers the service worker that makes the app work offline, and then hands
 * over to ScratchJr's own unmodified entry point.
 *
 * Ordering matters here. appEntry.js is imported statically so that it assigns
 * window.onload during module evaluation, before the load event fires. Database
 * start-up is asynchronous, which is fine: ScratchJr's iOS.waitForInterface()
 * polls for window.tablet, so the app starts the moment the database is ready.
 */

import WebTabletInterface, {setSoundManifest} from './tablet.js';
import * as DB from './db.js';

import {setPreloadedStyles} from '../src/app/src/utils/lib.js';
import styles from './styles.generated.js';

// Before appEntry runs: it builds the stylesheets on window.onload, and cannot
// wait for anything asynchronous to arrive first.
setPreloadedStyles(styles);

import '../src/app/appEntry.js';

async function loadJson (url) {
    try {
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.log('Could not load', url, e); // eslint-disable-line no-console
    }
    return {};
}

async function boot () {
    setSoundManifest(await loadJson('sound-manifest.json'));
    await DB.open();
    // Publishing window.tablet is what releases ScratchJr to start.
    window.tablet = new WebTabletInterface();
}

function registerServiceWorker () {
    if (!('serviceWorker' in navigator)) {
        return;
    }
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch((e) => {
            console.log('Service worker registration failed', e); // eslint-disable-line no-console
        });
    });
}

boot().catch((e) => {
    console.log('ScratchJr failed to start', e); // eslint-disable-line no-console
});

registerServiceWorker();
