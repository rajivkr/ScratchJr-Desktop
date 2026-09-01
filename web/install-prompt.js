/*
 * The install offer.
 *
 * This is the only interface this port adds, and it appears in exactly one
 * place: over the ScratchJr splash screen, in a browser, before the app has
 * been installed. The installed app never shows it, and neither does any page
 * a child navigates to afterwards.
 *
 * It offers one action and it never navigates anywhere. Pressing Install shows
 * the browser's own install dialog. When there is no dialog to show -- the app
 * is already installed, or this browser cannot install apps -- it says so in
 * words and stays put.
 */

const DISMISSED_KEY = 'scratchjr-install-dismissed';
const INSTALLED_KEY = 'scratchjr-installed';

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
#sjr-panel {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%) translateY(20px);
    z-index: 100000;
    width: min(460px, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 22px 24px 20px;
    background: #ffffff;
    border-radius: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,.10), 0 16px 40px rgba(0,0,0,.28);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    opacity: 0;
    transition: opacity .25s ease, transform .25s ease;
    pointer-events: none;
}
#sjr-panel.sjr-in {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
}
#sjr-panel .sjr-top { display: flex; align-items: center; gap: 15px; }
#sjr-panel .sjr-top img { width: 54px; height: 54px; border-radius: 12px; flex: none; }
#sjr-panel h3 { margin: 0 0 3px; font-size: 19px; font-weight: 600; color: #1d1d1f; }
#sjr-panel p { margin: 0; font-size: 14px; line-height: 1.45; color: #6b6b70; }
#sjr-panel ol { margin: 14px 0 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #3c3c43; }
#sjr-panel ol b { color: #1d1d1f; }
#sjr-panel .sjr-actions { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
#sjr-panel button {
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    padding: 11px 18px;
    border-radius: 9px;
    cursor: pointer;
    border: 0;
}
#sjr-panel .sjr-go { flex: 1; background: #007aff; color: #fff; }
#sjr-panel .sjr-go:hover { background: #0069db; }
#sjr-panel .sjr-later { background: none; color: #6b6b70; text-decoration: underline; }
#sjr-panel .sjr-later:hover { color: #1d1d1f; }
@media (max-width: 520px) {
    #sjr-panel { bottom: 12px; padding: 18px; }
}
`;

function render (mode) {
    if (document.getElementById('sjr-panel')) {
        return;
    }

    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'sjr-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Install ScratchJr');

    const identity =
        '<div class="sjr-top">' +
        '<img src="icons/icon-256.png" alt="">' +
        '<div><h3>Install ScratchJr</h3>' +
        '<p>Puts ScratchJr on this device with its own icon. Works without internet.</p>' +
        '</div></div>';

    if (mode === 'ios') {
        // Safari cannot be driven from script, so the steps are the action.
        panel.innerHTML = identity +
            '<ol><li>Tap the <b>Share</b> button.</li>' +
            '<li>Choose <b>Add to Home Screen</b>.</li></ol>' +
            '<div class="sjr-actions">' +
            '<button type="button" class="sjr-later" data-action="later">Not now</button>' +
            '</div>';
    } else {
        panel.innerHTML = identity +
            '<div class="sjr-actions">' +
            '<button type="button" class="sjr-go" data-action="install">Install</button>' +
            '<button type="button" class="sjr-later" data-action="later">Not now</button>' +
            '</div>';
    }

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('sjr-in'));

    panel.addEventListener('click', (event) => {
        const action = event.target.getAttribute && event.target.getAttribute('data-action');
        if (!action) {
            return;
        }
        if (action === 'install') {
            runInstall();
        } else {
            writeFlag('sessionStorage', DISMISSED_KEY);
            dismiss();
        }
    });
}

function dismiss () {
    const panel = document.getElementById('sjr-panel');
    if (!panel) {
        return;
    }
    panel.classList.remove('sjr-in');
    setTimeout(() => panel.remove(), 260);
}

function say (text) {
    const panel = document.getElementById('sjr-panel');
    if (!panel) {
        return;
    }
    panel.querySelector('p').textContent = text;
    const go = panel.querySelector('.sjr-go');
    if (go) {
        go.remove();
    }
}

async function runInstall () {
    if (!deferredPrompt) {
        say('ScratchJr is already installed on this device, or this browser cannot install apps.');
        return;
    }

    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();

    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
        writeFlag('localStorage', INSTALLED_KEY);
        dismiss();
    } else {
        dismiss();
    }
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

export default function mountInstallPrompt () {
    // Only over the splash screen, never inside the installed app, and never
    // again in a visit where it has been dismissed.
    if (window.scratchJrPage !== 'index' ||
        isStandalone() ||
        readFlag('sessionStorage', DISMISSED_KEY)) {
        return;
    }

    alreadyInstalled().then((installed) => {
        if (installed) {
            return;
        }

        window.addEventListener('beforeinstallprompt', (event) => {
            // Suppress the browser's own mini-infobar; this asks properly.
            event.preventDefault();
            deferredPrompt = event;
            render('install');
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
                    render('ios');
                }
            }, 1500);
        }
    });
}
