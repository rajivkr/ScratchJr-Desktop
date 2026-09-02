/*
 * The install gate.
 *
 * ScratchJr is an app, not a web page. In a browser tab this stands in front of
 * the app and offers exactly one thing to do: install it. The app itself only
 * starts once it is running in its own window.
 *
 * Two rules drive everything here:
 *
 *   1. A browser tab never runs ScratchJr. shouldRunApp() is the only place
 *      that decides, it is synchronous, and entry.js calls it before handing
 *      over to the app.
 *   2. An installed copy never sees this page. The installed app passes the
 *      gate outright; a browser tab on a device that already has the app is
 *      told where to find it instead of being asked to install it again.
 */

const INSTALLED_KEY = 'scratchjr-installed';

// ScratchJr's splash blue, and that colour darkened enough to carry white text.
const SPLASH = '#35A8E0';
const BRAND = '#166E96';

// How long to wait for Chrome/Edge to offer an install before falling back to
// telling the reader how to do it by hand. The event normally arrives as soon
// as the service worker takes control.
const PROMPT_GRACE = 3000;

let deferredPrompt = null;

/*
 * Deliberately not display-mode: fullscreen. A browser window put into
 * fullscreen reports it, so testing for it handed anyone an F11-sized hole
 * straight through the gate. The manifest asks for standalone, so standalone
 * -- plus the window-controls-overlay variant of it, and Safari's own flag --
 * is the whole of what an installed copy can look like.
 */
function isStandalone () {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        window.navigator.standalone === true;
}

function isIOS () {
    const ua = window.navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Development only: the build's own --serve host, so the app can be worked on
 * without installing it after every change. `?gate` puts the gate back, which
 * is the only way to see it locally. Neither applies anywhere else -- on a real
 * origin the gate is unconditional.
 */
function isDevHost () {
    const host = window.location.hostname;
    const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    return local && !/[?&]gate\b/.test(window.location.search);
}

function readFlag (key) {
    try {
        return window.localStorage.getItem(key) === '1';
    } catch (e) {
        return false;
    }
}

function writeFlag (key) {
    try {
        window.localStorage.setItem(key, '1');
    } catch (e) {
        // Private browsing. The gate simply asks again next time.
    }
}

function clearFlag (key) {
    try {
        window.localStorage.removeItem(key);
    } catch (e) {
        // Nothing was stored in the first place.
    }
}

/**
 * The one decision. Synchronous on purpose: entry.js has to know before the
 * load event whether to let ScratchJr start, and anything asynchronous here
 * would mean the app booting first and being torn down afterwards.
 */
export function shouldRunApp () {
    return isStandalone() || isDevHost();
}

/** Where the installed app will be found, in the words of this platform. */
function homeOfApps () {
    const ua = window.navigator.userAgent;
    if (isIOS() || /Android/.test(ua)) {
        return 'on your home screen';
    }
    if (/Mac OS X/.test(ua)) {
        return 'in your Applications folder';
    }
    if (/Windows/.test(ua)) {
        return 'in your Start menu';
    }
    return 'in your list of apps';
}

/** How to install by hand, when the browser will not be driven from script. */
function manualSteps () {
    const ua = window.navigator.userAgent;

    if (isIOS()) {
        return '1. Tap the <b>Share</b> button <span style="font-size:16px">&#x2934;</span><br>' +
            '2. Scroll down and tap <b>Add to Home Screen</b><br>' +
            '3. Tap <b>Add</b> in the top right';
    }
    if (/Firefox\//.test(ua)) {
        return 'Firefox cannot install apps. Open this page in <b>Chrome</b>, ' +
            '<b>Edge</b> or <b>Safari</b> and install it there.';
    }
    if (/Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) {
        return 'In the menu bar, choose <b>File</b>, then <b>Add to Dock</b>.';
    }
    return 'Open the browser menu and choose <b>Install ScratchJr</b>, or click the ' +
        'install icon at the right-hand end of the address bar.';
}

const STYLES = `
#sjr-gate {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: ${SPLASH};
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #fff;
}
#sjr-gate .sjr-card {
    width: 100%;
    max-width: 420px;
    background: ${BRAND};
    border-radius: 20px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, .32);
    padding: 28px 24px;
    text-align: center;
}
#sjr-gate .sjr-tile {
    width: 88px;
    height: 88px;
    margin: 0 auto 18px;
    border-radius: 20px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}
#sjr-gate .sjr-tile img { width: 72px; height: 72px; }
#sjr-gate .sjr-title {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 10px;
}
#sjr-gate .sjr-sub {
    font-size: 15px;
    line-height: 1.5;
    color: rgba(255, 255, 255, .82);
    margin-bottom: 20px;
}
#sjr-gate .sjr-steps {
    background: rgba(255, 255, 255, .12);
    border-radius: 14px;
    padding: 16px 18px;
    font-size: 14px;
    line-height: 1.7;
    text-align: left;
}
#sjr-gate button {
    width: 100%;
    display: block;
    border: none;
    border-radius: 14px;
    padding: 16px;
    font-family: inherit;
    font-size: 17px;
    font-weight: 700;
    background: #fff;
    color: ${BRAND};
    cursor: pointer;
}
#sjr-gate button:hover { background: #f2f2f2; }
#sjr-gate .sjr-foot {
    margin-top: 16px;
    font-size: 12px;
    line-height: 1.5;
    color: rgba(255, 255, 255, .62);
}
#sjr-gate .sjr-foot a { color: rgba(255, 255, 255, .82); }
`;

function card () {
    return document.getElementById('sjr-gate');
}

/** Replace the part of the card below the heading. */
function setBody (subtitle, action) {
    const gate = card();
    if (!gate) {
        return;
    }
    gate.querySelector('.sjr-sub').textContent = subtitle;
    gate.querySelector('.sjr-action').innerHTML = action;
}

function showInstallButton () {
    setBody(
        'ScratchJr runs as an app on this device. Install it to start.',
        '<button type="button" id="sjr-install">Install App</button>'
    );
}

function showManualSteps () {
    setBody(
        'ScratchJr runs as an app on this device. Here is how to install it.',
        '<div class="sjr-steps">' + manualSteps() + '</div>'
    );
}

/** Requirement two: an installed device is never asked to install again. */
function showAlreadyInstalled () {
    setBody(
        'ScratchJr is installed on this device.',
        '<div class="sjr-steps">Open ScratchJr ' + homeOfApps() + '.</div>'
    );
}

async function runInstall () {
    if (!deferredPrompt) {
        showManualSteps();
        return;
    }

    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();

    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
        writeFlag(INSTALLED_KEY);
        showAlreadyInstalled();
    } else {
        // Declined. The only way on is still to install, so ask again.
        deferredPrompt = prompt;
    }
}

/** Positive proof only: the browser saying yes, or our own record of it. */
async function alreadyInstalled () {
    if (readFlag(INSTALLED_KEY)) {
        return true;
    }
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

function render () {
    if (card()) {
        return;
    }

    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    const gate = document.createElement('div');
    gate.id = 'sjr-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-label', 'Install ScratchJr');
    gate.innerHTML =
        '<div class="sjr-card">' +
        '<div class="sjr-tile"><img src="icons/icon-256.png" alt=""></div>' +
        '<div class="sjr-title">ScratchJr</div>' +
        '<div class="sjr-sub"></div>' +
        '<div class="sjr-action"></div>' +
        '<div class="sjr-foot">Works without an internet connection once installed. ' +
        '<a href="/about.html">About this app</a></div>' +
        '</div>';

    document.body.appendChild(gate);

    gate.addEventListener('click', (event) => {
        if (event.target.id === 'sjr-install') {
            runInstall();
        }
    });

    // The splash markup is in the document but the app was never started; it
    // must not sit half-drawn behind a card it can be scrolled away from.
    const frame = document.getElementById('frame');
    if (frame) {
        frame.style.display = 'none';
    }
    document.body.style.background = SPLASH;
}

function whenBodyExists (whenDone) {
    if (document.body) {
        whenDone();
    } else {
        document.addEventListener('DOMContentLoaded', whenDone, {once: true});
    }
}

/**
 * Put the gate up. Called only when shouldRunApp() said no, so by the time
 * anything here runs ScratchJr is already not starting.
 */
export default function mountInstallGate () {
    // Captured whatever the state of the card: Chrome fires this once, early,
    // and there is no asking for it again.
    //
    // It arriving is also the browser stating that the app is not installed
    // here, which outranks our own record of an install -- that record goes
    // stale the moment somebody uninstalls, and a stale record must not lock a
    // device out of the one thing this page is for. So clear it and offer the
    // install again.
    window.addEventListener('beforeinstallprompt', (event) => {
        // Suppress the browser's own mini-infobar; the card asks properly.
        event.preventDefault();
        deferredPrompt = event;
        clearFlag(INSTALLED_KEY);
        if (card()) {
            showInstallButton();
        }
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        writeFlag(INSTALLED_KEY);
        showAlreadyInstalled();
    });

    whenBodyExists(() => {
        render();

        alreadyInstalled().then((installed) => {
            if (installed) {
                showAlreadyInstalled();
                return;
            }

            if (isIOS()) {
                // Safari never fires beforeinstallprompt; there is nothing to
                // wait for and nothing to press.
                showManualSteps();
                return;
            }

            showInstallButton();

            // A button that cannot do anything is worse than instructions.
            setTimeout(() => {
                if (!deferredPrompt && document.getElementById('sjr-install')) {
                    showManualSteps();
                }
            }, PROMPT_GRACE);
        });
    });
}
