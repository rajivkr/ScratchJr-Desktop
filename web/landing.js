/*
 * Install handling for the landing page.
 *
 * Deliberately draws no interface of its own. Chrome, Edge and Android fire
 * `beforeinstallprompt`, and the page's own Install button hands off to the
 * browser's native install dialog. Safari has no such event, so the manual
 * step is written into the note under the button, styled by the page.
 *
 * If installing is not possible at all, the page still offers a plain link to
 * open ScratchJr in the browser.
 */

const APP_URL = '/app/index.html';

let deferredPrompt = null;

function isStandalone () {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

function isIOS () {
    const ua = window.navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isSafari () {
    const ua = window.navigator.userAgent;
    return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Brave/.test(ua);
}

function manualSteps () {
    if (isIOS()) {
        return 'On iPad: tap <b>Share</b>, then <b>Add to Home Screen</b>.';
    }
    if (isSafari()) {
        return 'In Safari: choose <b>File</b>, then <b>Add to Dock</b>.';
    }
    return 'Use your browser’s install option, usually an icon at the right-hand end of the address bar.';
}

function button () {
    return document.getElementById('sjr-install-button');
}

function setNote (html) {
    const note = document.getElementById('sjr-install-note');
    if (note) {
        note.innerHTML = html || '';
    }
}

async function triggerInstall () {
    if (!deferredPrompt) {
        setNote(manualSteps());
        return;
    }
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();

    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
        markInstalled();
    } else {
        setNote(manualSteps());
    }
}

function markInstalled () {
    const el = button();
    if (el) {
        el.textContent = 'Open ScratchJr';
        el.dataset.state = 'installed';
    }
    setNote('');
}

function registerServiceWorker () {
    if (!('serviceWorker' in navigator)) {
        return;
    }
    // Registering here means the app is cached before the child first opens it,
    // so the first launch is instant and works with no connection.
    navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch((e) => {
        console.log('Service worker registration failed', e); // eslint-disable-line no-console
    });
}

window.addEventListener('beforeinstallprompt', (event) => {
    // Keep Chrome's mini-infobar out of the way; the page's button drives it.
    event.preventDefault();
    deferredPrompt = event;
});

window.addEventListener('appinstalled', markInstalled);

const el = button();
if (el) {
    el.addEventListener('click', () => {
        if (el.dataset.state === 'installed' || isStandalone()) {
            window.location.href = APP_URL;
            return;
        }
        triggerInstall();
    });
}

registerServiceWorker();

if (isStandalone()) {
    // Opened from an installed icon: go straight into the app. Guarded so a
    // failed navigation that lands back here cannot bounce forever -- the app
    // is then reachable from the button rather than automatically.
    let redirected = false;
    try {
        redirected = window.sessionStorage.getItem('sjr-redirected') === '1';
        window.sessionStorage.setItem('sjr-redirected', '1');
    } catch (e) {
        // Storage unavailable; fall through and redirect once.
    }
    if (!redirected) {
        window.location.replace(APP_URL);
    }
} else if (isSafari()) {
    setNote(manualSteps());
}
