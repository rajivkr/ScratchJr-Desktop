/*
 * The install gate.
 *
 * ScratchJr is an app, not a web page. In a browser tab this stands in front of
 * the app and offers exactly one thing to do: install it. The app itself only
 * starts once it is running in its own window.
 *
 * Three rules drive everything here:
 *
 *   1. A browser tab never runs ScratchJr. shouldRunApp() is the only place
 *      that decides, it is synchronous, and entry.js calls it before handing
 *      over to the app.
 *   2. An installed copy never sees this page. The installed app passes the
 *      gate outright; a browser tab on a device that already has the app is
 *      offered the app instead of being asked to install it again.
 *   3. The card offers a button -- Install, or Open -- and never a procedure.
 *      The reader is a parent who wants ScratchJr for their child, not
 *      somebody who is going to hunt through a browser menu. The one exception
 *      is the iPad, where Add to Home Screen is the only route Safari has and
 *      the Share button is the route every iPad owner already knows.
 */

const INSTALLED_KEY = 'scratchjr-installed';

// The manifest's start_url. Navigating here is what Open does.
const START_URL = '/index.html';

// ScratchJr's splash blue, and that colour darkened enough to carry white text.
const SPLASH = '#35A8E0';
const BRAND = '#166E96';

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

/**
 * The iPad's three steps, and only the iPad's.
 *
 * Safari has no installable event to hang a button on, so this is the one
 * place a procedure is unavoidable -- and it is the Share sheet, which is
 * where an iPad owner already goes to do anything with a page.
 */
function iosSteps () {
    return '1. Tap the <b>Share</b> button <span style="font-size:16px">&#x2934;</span><br>' +
        '2. Scroll down and tap <b>Add to Home Screen</b><br>' +
        '3. Tap <b>Add</b> in the top right';
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
#sjr-gate .sjr-hint {
    margin-top: 12px;
    font-size: 13px;
    line-height: 1.5;
    color: rgba(255, 255, 255, .78);
}
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
        '<button type="button" data-action="install">Install App</button>'
    );
}

function showIosSteps () {
    setBody(
        'Add ScratchJr to your Home Screen to start.',
        '<div class="sjr-steps">' + iosSteps() + '</div>'
    );
}

/**
 * Requirement two, and the other half of the two-button rule: a device that
 * already has ScratchJr is offered the app, never asked to install it twice.
 *
 * Open navigates to the app's start URL. An installed app that is set to open
 * its own links -- which is how Chrome, Edge and Safari install them -- takes
 * the navigation and opens its window. Where it does not, the reader lands
 * back here and the line under the button says where to find the icon, which
 * is a sentence about their own computer rather than about a browser menu.
 */
function showOpenButton (subtitle) {
    setBody(
        subtitle,
        '<button type="button" data-action="open">Open ScratchJr</button>' +
        '<div class="sjr-hint">You will also find ScratchJr ' + homeOfApps() + '.</div>'
    );
}

async function runInstall () {
    if (!deferredPrompt) {
        // No prompt to offer. Either ScratchJr is already here, or this
        // browser has asked recently and will not ask again for a while --
        // Chromium mutes the offer for a fortnight once it has been shown.
        // Both end the same way: the app exists, so offer to open it.
        showOpenButton('ScratchJr is already on this device.');
        return;
    }

    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();

    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
        writeFlag(INSTALLED_KEY);
        showOpenButton('ScratchJr is installed.');
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
        const action = event.target.getAttribute && event.target.getAttribute('data-action');
        if (action === 'install') {
            runInstall();
        } else if (action === 'open') {
            window.location.href = START_URL;
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
        showOpenButton('ScratchJr is installed.');
    });

    whenBodyExists(() => {
        render();

        // Install is the offer from the first paint, and it stays the offer.
        //
        // An earlier version put this button up and swapped it for written
        // instructions if beforeinstallprompt had not arrived in three
        // seconds. That was wrong twice over: three seconds is not long
        // enough for the event on a cold connection, and a browser that has
        // shown its install offer once mutes the event for a fortnight
        // afterwards -- so the machines it degraded on were the ones that had
        // already seen the offer, and what it degraded to was a paragraph
        // about browser menus. Pressing the button now sorts it out instead.
        if (isIOS()) {
            showIosSteps();
        } else {
            showInstallButton();
        }

        alreadyInstalled().then((installed) => {
            if (installed && !deferredPrompt) {
                showOpenButton('ScratchJr is already on this device.');
            }
        });
    });
}
