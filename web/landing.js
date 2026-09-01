/*
 * Install handling for the landing page.
 *
 * The button is a plain link to the app. That is deliberate: opening ScratchJr
 * is what it does by default, with no JavaScript involved, so it cannot end up
 * doing nothing if a script fails, is stale, or never loads.
 *
 * JavaScript only ever upgrades that link: when the browser has offered an
 * install dialog, the click is intercepted and the dialog shown instead.
 *
 * The label stays "Install ScratchJr" and is only ever changed on proof that
 * the app is installed -- the appinstalled event, or the page running in its
 * own window. It is deliberately not changed because an install offer has not
 * arrived: Chrome withholds beforeinstallprompt until the visitor has engaged
 * with the site, so on a first visit "no offer yet" means nothing at all. An
 * earlier version treated a 1.5 second silence as proof and told first-time
 * visitors to Open an app they had never installed.
 *
 * A panel slides up on arrival with the same offer, so nobody has to scroll
 * to find it. iPad Safari cannot be installed from script, so there the panel
 * spells out the two steps instead.
 */

const APP_URL = '/app/index.html';
const DISMISSED_KEY = 'scratchjr-install-dismissed';
const INSTALLED_KEY = 'scratchjr-installed';

// How long to wait before showing iPad Safari its manual steps.
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

// Dismissal lasts this visit only. Someone who taps Not now by accident, or
// changes their mind later, gets the offer again next time rather than never.
function remembersDismissal () {
    try {
        return window.sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function rememberDismissal () {
    try {
        window.sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch (e) {
        // Private browsing; the panel simply appears again next visit.
    }
}

function button () {
    return document.getElementById('sjr-install-button');
}

function openApp () {
    window.location.replace(new URL(APP_URL, window.location.origin).href);
}

function showOpenLabel () {
    const el = button();
    if (el) {
        el.textContent = 'Open ScratchJr';
    }
}

/**
 * Show the browser's install dialog. Returns false when there is none to show,
 * so the caller can fall back to simply opening the app.
 */
async function install () {
    if (!deferredPrompt) {
        return false;
    }

    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();

    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
        rememberInstalled();
        showOpenLabel();
    }
    // Declined: leave the label alone. They can still install it later, and
    // the link opens the app in the meantime.
    return true;
}

// ---- The panel -----------------------------------------------------------
//
// Styled to belong to this page: its heading font, its button colour, its
// rounded card edges. It is not a copy of the browser's own dialog.

const PANEL_STYLES = `
#sjr-panel {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%) translateY(20px);
    z-index: 2000;
    width: min(480px, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 24px 26px 22px;
    background: #ffffff;
    border-radius: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,.08), 0 16px 40px rgba(0,0,0,.22);
    opacity: 0;
    transition: opacity .25s ease, transform .25s ease;
    pointer-events: none;
}
#sjr-panel.sjr-in {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
}
#sjr-panel .sjr-top {
    display: flex;
    align-items: center;
    gap: 16px;
}
#sjr-panel .sjr-top img {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    flex: none;
}
#sjr-panel h3 {
    margin: 0 0 3px;
    font-family: 'Architects Daughter', cursive;
    font-size: 25px;
    line-height: 1.15;
    color: #212529;
}
#sjr-panel p {
    margin: 0;
    font-size: 15px;
    line-height: 1.45;
    color: #6c757d;
}
#sjr-panel ol {
    margin: 16px 0 0;
    padding-left: 22px;
    font-size: 15px;
    line-height: 1.6;
    color: #495057;
}
#sjr-panel ol b { color: #212529; }
#sjr-panel .sjr-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 20px;
}
#sjr-panel .sjr-go {
    flex: 1;
    font: inherit;
    font-size: 17px;
    font-weight: 500;
    padding: 12px 20px;
    border: 0;
    border-radius: 8px;
    background: #007bff;
    color: #fff;
    cursor: pointer;
    transition: background .15s ease;
}
#sjr-panel .sjr-go:hover { background: #0069d9; }
#sjr-panel .sjr-later {
    font: inherit;
    font-size: 15px;
    padding: 12px 4px;
    border: 0;
    background: none;
    color: #6c757d;
    cursor: pointer;
    text-decoration: underline;
}
#sjr-panel .sjr-later:hover { color: #212529; }
@media (max-width: 520px) {
    #sjr-panel { bottom: 12px; padding: 20px; }
    #sjr-panel h3 { font-size: 22px; }
}
`;

function buildPanel (mode) {
    const panel = document.createElement('div');
    panel.id = 'sjr-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Install ScratchJr');

    const top =
        '<div class="sjr-top">' +
        '<img src="/icons/icon-256.png" alt="">' +
        '<div><h3>Install ScratchJr</h3>' +
        '<p>Puts ScratchJr on this device with its own icon. Works without internet.</p>' +
        '</div></div>';

    if (mode === 'ios') {
        // Safari cannot be driven from script, so the steps are the action.
        panel.innerHTML = top +
            '<ol>' +
            '<li>Tap the <b>Share</b> button at the top of Safari.</li>' +
            '<li>Choose <b>Add to Home Screen</b>.</li>' +
            '</ol>' +
            '<div class="sjr-actions">' +
            '<button type="button" class="sjr-later" data-action="later">Not now</button>' +
            '</div>';
    } else {
        panel.innerHTML = top +
            '<div class="sjr-actions">' +
            '<button type="button" class="sjr-go" data-action="install">Install</button>' +
            '<button type="button" class="sjr-later" data-action="later">Not now</button>' +
            '</div>';
    }
    return panel;
}

function showPanel (mode) {
    if (document.getElementById('sjr-panel') || remembersDismissal()) {
        return;
    }

    if (!document.getElementById('sjr-panel-styles')) {
        const style = document.createElement('style');
        style.id = 'sjr-panel-styles';
        style.textContent = PANEL_STYLES;
        document.head.appendChild(style);
    }

    const panel = buildPanel(mode);
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('sjr-in'));

    panel.addEventListener('click', (event) => {
        const action = event.target.getAttribute && event.target.getAttribute('data-action');
        if (!action) {
            return;
        }
        if (action === 'install') {
            hidePanel();
            install().then((shown) => {
                if (!shown) {
                    openApp();
                }
            });
        } else {
            rememberDismissal();
            hidePanel();
        }
    });
}

function hidePanel () {
    const panel = document.getElementById('sjr-panel');
    if (!panel) {
        return;
    }
    panel.classList.remove('sjr-in');
    setTimeout(() => panel.remove(), 260);
}

/**
 * Remember, on this device, that the app was installed from here.
 *
 * getInstalledRelatedApps is the browser's own answer, but it only reflects
 * related_applications from a manifest the browser has re-read, and browsers
 * cache manifests for a long time. Recording the appinstalled event ourselves
 * gives an answer that is right immediately and stays right.
 */
function rememberInstalled () {
    try {
        window.localStorage.setItem(INSTALLED_KEY, '1');
    } catch (e) {
        // Storage unavailable; fall back to asking the browser.
    }
}

function wasInstalledFromHere () {
    try {
        return window.localStorage.getItem(INSTALLED_KEY) === '1';
    } catch (e) {
        return false;
    }
}

/**
 * Ask the browser whether this app is already installed.
 *
 * This is positive proof, not a guess: it only ever reports true when the
 * browser knows the app is installed. Nothing here concludes anything from an
 * install offer failing to arrive -- that is normal on a first visit, and an
 * earlier version got this badly wrong by treating silence as evidence.
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
    // Suppress Chrome's own mini-infobar; this page asks properly instead.
    event.preventDefault();
    deferredPrompt = event;
    setTimeout(() => showPanel('install'), 900);
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hidePanel();
    rememberInstalled();
    showOpenLabel();
});

const el = button();
if (el) {
    el.addEventListener('click', (event) => {
        if (!deferredPrompt) {
            // Let the link do exactly what it says: open the app.
            return;
        }
        event.preventDefault();
        install();
    });
}

registerServiceWorker();

// If it is already installed, say so and let the button open it. Our own
// record answers instantly; the browser's answer catches devices where it was
// installed before this code existed, once the manifest is re-read.
if (wasInstalledFromHere()) {
    showOpenLabel();
} else {
    alreadyInstalled().then((installed) => {
        if (installed) {
            rememberInstalled();
            showOpenLabel();
        }
    });
}

if (isStandalone()) {
    // Belt and braces: the head of this page already redirects. The guard that
    // used to sit here could skip the redirect on a second load in the same
    // window, stranding the installed app on the landing page. It existed to
    // break a loop whose actual cause -- the service worker falling back to
    // this page -- is fixed.
    openApp();
} else if (isIOS()) {
    // Safari never fires beforeinstallprompt, so waiting for it tells us
    // nothing. Show the two manual steps.
    setTimeout(() => {
        if (!deferredPrompt) {
            showPanel('ios');
        }
    }, INSTALL_OFFER_TIMEOUT);
}
