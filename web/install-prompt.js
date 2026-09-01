/*
 * The install offer.
 *
 * The only interface this port adds, and it appears in exactly one place: over
 * the ScratchJr splash screen, in a browser, before the app has been installed.
 * The installed app never shows it.
 *
 * Laid out after the install banner in Norven: a bar across the bottom in the
 * brand colour, the app's own icon on a white tile, and two full-width buttons
 * stacked so there is nothing to aim at. iPad Safari cannot be driven from
 * script, so it gets the three steps written out instead.
 */

const DISMISSED_KEY = 'scratchjr-install-dismissed';
const INSTALLED_KEY = 'scratchjr-installed';

// ScratchJr's splash blue is #35A8E0; this is that colour darkened enough to
// carry white text, so the bar reads as part of the app rather than bolted on.
const BRAND = '#166E96';

let deferredPrompt = null;

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

function readFlag (store, key) {
    try {
        return window[store].getItem(key) === '1';
    } catch (e) {
        return false;
    }
}

function writeFlag (store, key) {
    try {
        window[store].setItem(key, '1');
    } catch (e) {
        // Private browsing. The offer simply appears again next time.
    }
}

const STYLES = `
@keyframes sjrSlideUp {
    from { opacity: 0; transform: translateY(100%); }
    to   { opacity: 1; transform: translateY(0); }
}
#sjr-install {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 99999;
    background: ${BRAND};
    box-shadow: 0 -4px 32px rgba(0, 0, 0, .32);
    animation: sjrSlideUp .3s ease;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
#sjr-install.sjr-out {
    animation: sjrSlideUp .25s ease reverse forwards;
}
#sjr-install .sjr-inner {
    max-width: 520px;
    margin: 0 auto;
    padding: 20px 20px 26px;
}
#sjr-install .sjr-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
}
#sjr-install .sjr-tile {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: #fff;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}
#sjr-install .sjr-tile img { width: 40px; height: 40px; }
#sjr-install .sjr-title {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    line-height: 1.3;
}
#sjr-install .sjr-sub {
    font-size: 12px;
    color: rgba(255, 255, 255, .75);
    line-height: 1.4;
}
#sjr-install .sjr-steps {
    background: rgba(255, 255, 255, .12);
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 12px;
    font-size: 13px;
    color: #fff;
    line-height: 1.7;
}
#sjr-install .sjr-steps b { color: #fff; }
#sjr-install button {
    width: 100%;
    display: block;
    border: none;
    border-radius: 12px;
    padding: 14px;
    font-family: inherit;
    font-size: 15px;
    cursor: pointer;
}
#sjr-install .sjr-go {
    background: #fff;
    color: ${BRAND};
    font-weight: 700;
    margin-bottom: 10px;
}
#sjr-install .sjr-go:hover { background: #f2f2f2; }
#sjr-install .sjr-later {
    background: rgba(255, 255, 255, .15);
    color: #fff;
    font-weight: 600;
}
#sjr-install .sjr-later:hover { background: rgba(255, 255, 255, .24); }
`;

function render (mode) {
    if (document.getElementById('sjr-install')) {
        return;
    }

    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.id = 'sjr-install';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Install ScratchJr');

    const head =
        '<div class="sjr-head">' +
        '<div class="sjr-tile"><img src="icons/icon-256.png" alt=""></div>' +
        '<div>' +
        '<div class="sjr-title">Install ScratchJr</div>' +
        '<div class="sjr-sub">Get the app on this device. Works without internet.</div>' +
        '</div></div>';

    const action = (mode === 'ios')
        ? '<div class="sjr-steps">' +
          '1. Tap the <b>Share</b> button <span style="font-size:16px">&#x2934;</span><br>' +
          '2. Scroll down and tap <b>Add to Home Screen</b><br>' +
          '3. Tap <b>Add</b> in the top right' +
          '</div>'
        : '<button type="button" class="sjr-go" data-action="install">Install App</button>';

    const dismissLabel = (mode === 'ios') ? 'Got it' : 'Not now';

    bar.innerHTML = '<div class="sjr-inner">' + head + action +
        '<button type="button" class="sjr-later" data-action="later">' + dismissLabel + '</button>' +
        '</div>';

    document.body.appendChild(bar);

    bar.addEventListener('click', (event) => {
        const target = event.target.closest && event.target.closest('[data-action]');
        if (!target) {
            return;
        }
        if (target.getAttribute('data-action') === 'install') {
            runInstall();
        } else {
            writeFlag('sessionStorage', DISMISSED_KEY);
            dismiss();
        }
    });
}

function dismiss () {
    const bar = document.getElementById('sjr-install');
    if (!bar) {
        return;
    }
    bar.classList.add('sjr-out');
    setTimeout(() => bar.remove(), 260);
}

function say (text) {
    const bar = document.getElementById('sjr-install');
    if (!bar) {
        return;
    }
    bar.querySelector('.sjr-sub').textContent = text;
    const go = bar.querySelector('.sjr-go');
    if (go) {
        go.remove();
    }
}

async function runInstall () {
    if (!deferredPrompt) {
        say('Already installed on this device, or this browser cannot install apps.');
        return;
    }

    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();

    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
        writeFlag('localStorage', INSTALLED_KEY);
    }
    dismiss();
}

/** Positive proof only: the browser saying yes, or our own record of it. */
async function alreadyInstalled () {
    if (readFlag('localStorage', INSTALLED_KEY)) {
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

/**
 * Wait until the splash has finished asking where ScratchJr is being used, so
 * the bar does not cover that question's own answers on a first run.
 *
 * This waits on state, not on time. ScratchJr records the answer in
 * localStorage.appUsage, so the question is over exactly when that exists.
 * Two earlier attempts polled the question's CSS class instead and both raced
 * the app's start-up -- they looked at a moment when the question had not been
 * rendered yet, concluded it was not being asked, and put the bar on top of it.
 */
function whenSplashIsClear (whenDone) {
    const INTERVAL = 400;
    const GIVE_UP = 20000;
    let waited = 0;

    const answered = () => {
        try {
            return window.localStorage.getItem('appUsage') !== null;
        } catch (e) {
            return true;
        }
    };

    const check = () => {
        if (answered() || waited > GIVE_UP) {
            whenDone();
            return;
        }
        waited += INTERVAL;
        setTimeout(check, INTERVAL);
    };

    check();
}

export default function mountInstallPrompt () {
    if (window.scratchJrPage !== 'index' ||
        isStandalone() ||
        readFlag('sessionStorage', DISMISSED_KEY)) {
        return;
    }

    alreadyInstalled().then((installed) => {
        if (installed) {
            return;
        }

        const show = (mode) => whenSplashIsClear(() => setTimeout(() => render(mode), 800));

        window.addEventListener('beforeinstallprompt', (event) => {
            // Suppress the browser's own mini-infobar; this asks properly.
            event.preventDefault();
            deferredPrompt = event;
            show('install');
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            writeFlag('localStorage', INSTALLED_KEY);
            dismiss();
        });

        if (isIOS()) {
            // Safari never fires beforeinstallprompt.
            setTimeout(() => {
                if (!deferredPrompt) {
                    show('ios');
                }
            }, 1500);
        }
    });
}
