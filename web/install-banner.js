/*
 * The install bar on the landing page.
 *
 * The bar is up for every reader, and says one of three things:
 *
 *   Install App        the default. Pressing it opens the browser's own
 *                      install dialog.
 *   Add to Home Screen an iPad, where Safari has no installable event and the
 *                      Share sheet is the only route.
 *   Already installed  only on proof -- getInstalledRelatedApps() naming this
 *                      app. Then there is nothing to install and the bar says
 *                      where to find it instead.
 *
 * Proof, not inference. A browser goes quiet for two different reasons: the
 * app is already installed, or it made its own install offer here recently and
 * mutes itself for a fortnight afterwards. The version before this one read
 * every silence as the first and told somebody who had just uninstalled the
 * app to go and search for it. So silence alone now decides nothing: without
 * proof the bar offers the install, which is what a first-time reader needs.
 *
 * There is no API to launch an installed app from a page, so 'open it' is a
 * sentence about their own device rather than a button that lies.
 *
 * The markup and every style live in the landing page itself. The bar and the
 * button are display:none in CSS until this file reveals them, and a media
 * query hides them again with !important inside an installed window, so the
 * JavaScript is not the only thing standing between the app and this bar.
 *
 * Laid out after the install banner in Norven: fixed across the bottom in the
 * brand colour, the app's own icon on a white tile, two full-width buttons
 * stacked so there is nothing to aim at.
 */

(function () {
    'use strict';

    var DISMISSED_KEY = 'scratchjr-install-dismissed';
    var APP_URL = '/app/index.html';

    // How long to give beforeinstallprompt before concluding it is not coming.
    // The event lands as soon as the manifest and icons are read, so this is
    // only long enough to keep the bar from changing under a reader's finger.
    var PROMPT_GRACE = 1500;

    var bar = document.getElementById('pwa-install-bar');
    var button = document.getElementById('pwa-install-btn');
    var steps = document.getElementById('pwa-install-ios');
    var installed = document.getElementById('pwa-installed');
    var unavailable = document.getElementById('pwa-unavailable');
    var later = document.getElementById('pwa-install-later');

    var deferredPrompt = null;

    /*
     * Installed app, or fullscreen browser? They are not the same question and
     * one media query cannot answer both.
     *
     * isPWA is the whole of what an installed copy can be: the manifest asks
     * for display: standalone, so an installed ScratchJr window reports
     * standalone -- or the window-controls-overlay variant of it, or Safari's
     * own flag. It never reports fullscreen.
     *
     * isFullscreen is a browser filling the screen, which is nobody's business
     * but the reader's. Only isPWA is allowed to take the bar away. Testing
     * fullscreen for that was measured twice on this machine and both times it
     * left an ordinary reader with no button and no explanation.
     */
    function getDisplayState () {
        var isPWA =
            window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: window-controls-overlay)').matches ||
            window.navigator.standalone === true;

        var isFullscreen = Boolean(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            window.matchMedia('(display-mode: fullscreen)').matches
        );

        return {
            isPWA: isPWA,
            isFullscreen: isFullscreen,
            isNormalBrowser: !isPWA && !isFullscreen
        };
    }

    // Early exit, before a single listener is attached, so the installed app
    // carries none of this.
    if (getDisplayState().isPWA) {
        // The installed app has no business on the landing page. If it lands
        // here -- a bookmark, a shared link -- send it into ScratchJr.
        window.location.replace(APP_URL);
        return;
    }

    function isIOS () {
        var ua = window.navigator.userAgent;
        return /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function dismissedThisSession () {
        try {
            return window.sessionStorage.getItem(DISMISSED_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    var title = document.getElementById('pwa-title');
    var sub = bar.querySelector('.pwa-sub');

    /** mode: 'install', 'ios', 'installed' (proven), or 'unavailable'. */
    function show (mode) {
        bar.style.display = 'block';
        document.body.classList.add('pwa-bar-open');

        button.style.display = mode === 'install' ? 'block' : 'none';
        steps.style.display = mode === 'ios' ? 'block' : 'none';
        installed.style.display = mode === 'installed' ? 'block' : 'none';
        unavailable.style.display = mode === 'unavailable' ? 'block' : 'none';

        if (mode === 'install') {
            title.textContent = 'Install ScratchJr';
            sub.textContent = 'Get the app on this device. Works without internet.';
            later.textContent = 'Not now';
        } else if (mode === 'ios') {
            title.textContent = 'Install ScratchJr';
            sub.textContent = 'Add it to your Home Screen to get the app.';
            later.textContent = 'Got it';
        } else if (mode === 'installed') {
            title.textContent = 'ScratchJr is already installed';
            sub.textContent = 'It is on this device, in its own window.';
            later.textContent = 'Got it';
        } else {
            title.textContent = 'Install ScratchJr';
            sub.textContent = 'This browser is not offering it at the moment.';
            later.textContent = 'Got it';
        }
    }

    function hide () {
        bar.style.display = 'none';
        button.style.display = 'none';
        steps.style.display = 'none';
        installed.style.display = 'none';
        unavailable.style.display = 'none';
        document.body.classList.remove('pwa-bar-open');
    }

    if (dismissedThisSession()) {
        return;
    }

    // Whenever the offer arrives -- before the grace period is up or long
    // after it -- the button becomes Install.
    window.addEventListener('beforeinstallprompt', function (event) {
        // Suppress the browser's own mini-infobar; the bar asks properly.
        event.preventDefault();
        deferredPrompt = event;
        show('install');
    });

    button.addEventListener('click', function () {
        if (!deferredPrompt) {
            // The browser has muted its own offer here. Nothing on this page
            // can lift that, and saying so beats a button that does nothing.
            show('unavailable');
            return;
        }
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (choice) {
            deferredPrompt = null;
            if (choice.outcome === 'accepted') {
                show('installed');
            } else {
                hide();
            }
        });
    });

    // Covers an install started from the browser's own address bar, which
    // never goes through the button.
    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        show('installed');
    });

    later.addEventListener('click', function () {
        try {
            window.sessionStorage.setItem(DISMISSED_KEY, '1');
        } catch (e) {
            // Private browsing. The bar simply offers again next time.
        }
        hide();
    });

    // Safari fires no beforeinstallprompt and never will, so the iPad -- the
    // device ScratchJr was written for -- gets the Share sheet steps in place
    // of the button. It is the only route Safari has.
    if (isIOS()) {
        show('ios');
        return;
    }

    /**
     * Positive proof only: the browser naming this app as one it has already
     * installed. An empty answer, or no answer at all, proves nothing and is
     * treated as not installed -- the reader gets the install offer, which is
     * the harmless way to be wrong.
     */
    function provenInstalled () {
        if (!navigator.getInstalledRelatedApps) {
            return Promise.resolve(false);
        }
        return navigator.getInstalledRelatedApps().then(function (apps) {
            return Array.isArray(apps) && apps.length > 0;
        }).catch(function () {
            return false;
        });
    }

    // Up either way, once there has been a moment for the browser to speak.
    setTimeout(function () {
        if (deferredPrompt) {
            return;
        }
        provenInstalled().then(function (yes) {
            if (deferredPrompt) {
                return;
            }
            show(yes ? 'installed' : 'install');
        });
    }, PROMPT_GRACE);
}());
