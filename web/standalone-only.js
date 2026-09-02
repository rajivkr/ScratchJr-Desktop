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
 * The one decision. Synchronous on purpose: entry.js has to know before the
 * load event whether to let ScratchJr start, and anything asynchronous here
 * would mean the app booting first and being torn down afterwards.
 *
 * There was briefly a third way in: a flag the landing page set when its Open
 * button was pressed, for readers whose browser would not offer an install.
 * It was reported straight away from a machine where ScratchJr was installed
 * -- the browser was silent because of that, not because it could not install
 * -- and pressing Open produced a web page rather than the app. The landing
 * page says so instead now, and this has no exceptions again.
 */
export function shouldRunApp () {
    return isStandalone() || isDevHost();
}

/** Called only when shouldRunApp() said no. */
export default function sendToLanding () {
    // replace, not assign: Back from the landing page must not come straight
    // back here and bounce again.
    window.location.replace(LANDING_URL);
}
