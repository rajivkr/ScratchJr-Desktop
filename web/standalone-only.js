/*
 * ScratchJr runs in its own window or not at all.
 *
 * A browser tab that reaches an app page -- a stale bookmark, a shared link,
 * somebody typing the URL -- is sent to the landing page, where the only thing
 * on offer is installing it. The app is never started in a tab: entry.js calls
 * shouldRunApp() before handing over, so nothing downstream of window.tablet
 * runs either.
 *
 * This replaced a card that stood in front of the app in the tab and offered
 * Install. It could not keep its promise. Chromium mutes its own install offer
 * on an origin for a fortnight after showing it once, so on any device that
 * had already been asked the card had no install to give and fell back to
 * offering Open, which navigated to the app, which put the card up again. The
 * landing page is a place a browser can honestly be sent to instead.
 */

const LANDING_URL = '/';

// Set by the landing page's Open button, and by ?open in case storage is
// unavailable. See askedToOpenInBrowser().
const OPEN_KEY = 'scratchjr-open-in-browser';

/*
 * Deliberately not display-mode: fullscreen. A browser window put into
 * fullscreen reports it, so testing for it handed anyone an F11-sized hole
 * straight through this check. The manifest asks for standalone, so standalone
 * -- plus the window-controls-overlay variant of it, and Safari's own flag --
 * is the whole of what an installed copy can look like.
 */
function isStandalone () {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        window.navigator.standalone === true;
}

/**
 * Development only: the build's own --serve host, so the app can be worked on
 * without installing it after every change. `?landing` sends the tab to the
 * landing page instead, which is the only way to see a visitor's route
 * locally. Neither applies anywhere else -- on a real origin an app page in a
 * tab always redirects.
 */
function isDevHost () {
    const host = window.location.hostname;
    const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    return local && !/[?&]landing\b/.test(window.location.search);
}

/**
 * The reader pressed Open on the landing page.
 *
 * That button only exists when the browser will not offer an install -- it has
 * shown its own offer on this origin recently and mutes it for a fortnight
 * afterwards, or it cannot install at all. Bouncing those people back to a
 * page whose only button sent them here is the loop this file was written to
 * end, and it left them with no way to reach ScratchJr at all.
 *
 * Kept in sessionStorage rather than the URL alone because the app navigates
 * between its own pages by relative name, and the permission has to survive
 * index.html -> home.html -> editor.html. It dies with the tab.
 */
function askedToOpenInBrowser () {
    const inUrl = /[?&]open\b/.test(window.location.search);
    try {
        if (inUrl) {
            window.sessionStorage.setItem(OPEN_KEY, '1');
            return true;
        }
        return window.sessionStorage.getItem(OPEN_KEY) === '1';
    } catch (e) {
        return inUrl;
    }
}

/**
 * The one decision. Synchronous on purpose: entry.js has to know before the
 * load event whether to let ScratchJr start, and anything asynchronous here
 * would mean the app booting first and being torn down afterwards.
 */
export function shouldRunApp () {
    return isStandalone() || isDevHost() || askedToOpenInBrowser();
}

/** Called only when shouldRunApp() said no. */
export default function sendToLanding () {
    // replace, not assign: Back from the landing page must not come straight
    // back here and bounce again.
    window.location.replace(LANDING_URL);
}
