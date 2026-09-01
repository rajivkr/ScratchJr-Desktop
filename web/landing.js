/*
 * Install logic for the landing page.
 *
 * Chrome, Edge and Android fire `beforeinstallprompt`; the Install button and
 * the bottom panel both hand off to the browser's own install dialog. Safari
 * has no such event, so Mac and iPad Safari get the two-step manual
 * instructions instead. If installing is not possible at all, the page still
 * offers a plain link to open ScratchJr in the browser.
 */

const APP_URL = '/app/index.html';
const DISMISS_KEY = 'scratchjr-install-dismissed';

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
        return 'Tap <b>Share</b>, then <b>Add to Home Screen</b>.';
    }
    if (isSafari()) {
        return 'In the address bar choose <b>Share</b>, then <b>Add to Dock</b>.';
    }
    return 'Look for the install icon at the right-hand end of the address bar.';
}

// ---- Bottom panel --------------------------------------------------------

const PANEL_STYLES = `
#sjr-install {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%) translateY(16px);
    z-index: 100000;
    width: min(560px, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 20px 22px;
    border-radius: 14px;
    background: #2b2b2e;
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
    color: #f2f2f4;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    opacity: 0;
    transition: opacity 220ms ease, transform 220ms ease;
    pointer-events: none;
}
#sjr-install.sjr-visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
}
#sjr-install .sjr-heading {
    font-size: 17px;
    font-weight: 600;
    margin: 0 0 16px 0;
}
#sjr-install .sjr-app {
    display: flex;
    align-items: center;
    gap: 14px;
}
#sjr-install .sjr-app img {
    width: 44px;
    height: 44px;
    border-radius: 9px;
    flex: none;
}
#sjr-install .sjr-name { font-size: 15px; font-weight: 500; line-height: 1.35; }
#sjr-install .sjr-host { font-size: 13px; color: #a9a9b2; line-height: 1.35; }
#sjr-install .sjr-steps { margin: 14px 0 0 0; font-size: 14px; line-height: 1.55; color: #d6d6dc; }
#sjr-install .sjr-steps b { color: #ffffff; font-weight: 600; }
#sjr-install .sjr-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 20px;
}
#sjr-install button {
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    padding: 9px 20px;
    border-radius: 999px;
    cursor: pointer;
    border: 1px solid #6e7bea;
    background: transparent;
    color: #aab2f5;
}
#sjr-install button:hover { background: rgba(110, 123, 234, 0.16); }
#sjr-install button.sjr-primary { background: #6e7bea; border-color: #6e7bea; color: #ffffff; }
#sjr-install button.sjr-primary:hover { background: #808cf0; }
@media (max-width: 520px) {
    #sjr-install { bottom: 12px; padding: 16px 18px; }
    #sjr-install .sjr-actions button { flex: 1; }
}
`;

function showPanel (mode) {
    if (document.getElementById('sjr-install') || wasDismissed()) {
        return;
    }

    const style = document.createElement('style');
    style.textContent = PANEL_STYLES;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'sjr-install';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Install ScratchJr');

    const identity =
        '<div class="sjr-app">' +
        '<img src="/icons/icon-192.png" alt="">' +
        '<div><div class="sjr-name">ScratchJr</div>' +
        '<div class="sjr-host">' + (window.location.hostname || 'scratchjr') + '</div></div>' +
        '</div>';

    panel.innerHTML = (mode === 'prompt')
        ? '<p class="sjr-heading">Install app</p>' + identity +
          '<div class="sjr-actions">' +
          '<button type="button" data-action="cancel">Cancel</button>' +
          '<button type="button" class="sjr-primary" data-action="install">Install</button>' +
          '</div>'
        : '<p class="sjr-heading">Install app</p>' + identity +
          '<p class="sjr-steps">' + manualSteps() + '</p>' +
          '<div class="sjr-actions"><button type="button" data-action="cancel">Done</button></div>';

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('sjr-visible'));

    panel.addEventListener('click', (event) => {
        const action = event.target.getAttribute && event.target.getAttribute('data-action');
        if (!action) {
            return;
        }
        if (action === 'install') {
            triggerInstall();
        } else {
            remember();
        }
        hidePanel();
    });
}

function hidePanel () {
    const panel = document.getElementById('sjr-install');
    if (!panel) {
        return;
    }
    panel.classList.remove('sjr-visible');
    setTimeout(() => panel.remove(), 240);
}

function remember () {
    try {
        window.localStorage.setItem(DISMISS_KEY, '1');
    } catch (e) {
        // Private browsing; the panel simply reappears next visit.
    }
}

function wasDismissed () {
    try {
        return window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch (e) {
        return false;
    }
}

// ---- The Install button on the page --------------------------------------

function setButtonState (state, text) {
    const button = document.getElementById('sjr-install-button');
    const note = document.getElementById('sjr-install-note');
    if (!button) {
        return;
    }
    button.dataset.state = state;
    if (text) {
        button.textContent = text;
    }
    if (note) {
        note.innerHTML = (state === 'manual') ? manualSteps() : '';
    }
}

async function triggerInstall () {
    if (deferredPrompt) {
        const prompt = deferredPrompt;
        deferredPrompt = null;
        prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') {
            setButtonState('installed', 'Open ScratchJr');
        } else {
            deferredPrompt = null;
            setButtonState('manual', 'Install ScratchJr');
        }
        return;
    }
    setButtonState('manual', 'Install ScratchJr');
    showPanel('manual');
}

function wireButton () {
    const button = document.getElementById('sjr-install-button');
    if (!button) {
        return;
    }
    button.addEventListener('click', () => {
        if (button.dataset.state === 'installed' || isStandalone()) {
            window.location.href = APP_URL;
            return;
        }
        triggerInstall();
    });
}

// ---- Start-up ------------------------------------------------------------

function registerServiceWorker () {
    if (!('serviceWorker' in navigator)) {
        return;
    }
    // Registering here means the whole app is cached before the child ever
    // opens it, so the first launch is instant and works offline.
    navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch((e) => {
        console.log('Service worker registration failed', e); // eslint-disable-line no-console
    });
}

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    setButtonState('ready', 'Install ScratchJr');
    setTimeout(() => showPanel('prompt'), 1200);
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hidePanel();
    setButtonState('installed', 'Open ScratchJr');
});

wireButton();
registerServiceWorker();

if (isStandalone()) {
    // Opened from an installed icon: go straight into the app.
    window.location.replace(APP_URL);
} else if (isSafari()) {
    setButtonState('manual', 'Install ScratchJr');
    setTimeout(() => showPanel('manual'), 2500);
}
