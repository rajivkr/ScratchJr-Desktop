/*
 * Install handling for the landing page.
 *
 * The one rule here: the button always does something. The people using this
 * are parents, not developers -- "look for an icon in your address bar" is not
 * an instruction anybody should have to follow.
 *
 * So there are exactly two states:
 *
 *   Install ScratchJr  - the browser offered us an install dialog; show it.
 *   Open ScratchJr     - it is already installed, or this browser cannot
 *                        install. Either way, open the app. It works in a
 *                        browser tab just as well.
 *
 * iPad Safari is the one case where installing genuinely needs a manual step,
 * so it gets one plain sentence -- and the button still opens the app.
 */

const APP_URL = '/app/index.html';

// How long to wait for the browser to offer an install before deciding it
// isn't going to. Chrome fires this within a few hundred milliseconds.
const INSTALL_OFFER_TIMEOUT = 1500;

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

function button () {
    return document.getElementById('sjr-install-button');
}

function setNote (text) {
    const note = document.getElementById('sjr-install-note');
    if (note) {
        note.textContent = text || '';
    }
}

function showInstall () {
    const el = button();
    if (el) {
        el.textContent = 'Install ScratchJr';
        el.dataset.state = 'install';
    }
    setNote('');
}

function showOpen () {
    const el = button();
    if (el) {
        el.textContent = 'Open ScratchJr';
        el.dataset.state = 'open';
    }
    setNote(isIOS() ? 'To keep it on your Home Screen: tap Share, then Add to Home Screen.' : '');
}

function openApp () {
    window.location.href = APP_URL;
}

async function onClick () {
    if (!deferredPrompt) {
        openApp();
        return;
    }

    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();

    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
        showOpen();
    } else {
        // They said no. Opening it is still useful, so offer that instead of
        // pushing the install again.
        showOpen();
    }
}

/**
 * Ask the browser whether this app is already installed. Supported on Chrome
 * and Edge; elsewhere the timeout below covers the same ground.
 */
async function alreadyInstalled () {
    if (!navigator.getInstalledRelatedApps) {
        return false;
    }
    try {
        const apps = await navigator.getInstalledRelatedApps();
        return Array.isArray(apps) && apps.length > 0;
    } catch (e) {
        return false;
    }
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
    showInstall();
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    showOpen();
});

const el = button();
if (el) {
    el.addEventListener('click', onClick);
}

registerServiceWorker();

if (isStandalone()) {
    // Opened from an installed icon: go straight into the app. Guarded so a
    // failed navigation that lands back here cannot bounce forever.
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
} else {
    alreadyInstalled().then((installed) => {
        if (installed) {
            showOpen();
            return;
        }
        // No install offer by now means it is installed, or this browser
        // cannot install. Offer to open it rather than leaving a dead button.
        setTimeout(() => {
            if (!deferredPrompt) {
                showOpen();
            }
        }, INSTALL_OFFER_TIMEOUT);
    });
}
