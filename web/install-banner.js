/*
 * The install bar on the landing page.
 *
 * The bar is up for every reader, and says one of three things:
 *
 *   Install App        the default. Pressing it opens the browser's own
 *                      install dialog.
 *   Add to Home Screen an iPad, where Safari has no installable event and the
 *                      Share sheet is the only route.
 *   Open ScratchJr    only on proof -- getInstalledRelatedApps() naming this
 *                      app as one this browser profile has installed.
 *
 * Proof, not inference. A browser goes quiet for two different reasons: the
 * app is already installed, or it made its own install offer here recently and
 * mutes itself afterwards -- and Chromium keeps that mute even after the app
 * is uninstalled. An earlier version read every silence as "installed" and told
 * somebody who had just uninstalled the app to go and search for it. So
 * silence alone decides nothing now: without proof the bar offers the install,
 * which is what a first-time reader needs and is the harmless way to be wrong.
 *
 * Open is an <a>, not a button, because Chromium only hands a navigation off
 * to an installed window for a real user-initiated link click, and only with
 * the manifest's launch_handler set to focus-existing. Where that hand-off
 * does not happen the tab simply navigates to the app, the app's own guard
 * sends it back here, and the flag set on the way out turns this into a line
 * about where to find the icon rather than the same button again.
 *
 * A browser that has muted its own install offer will not give this page a
 * prompt, and nothing in a page can lift that. That state gets one line in the
 * bar and nothing else. It briefly got an overlay pointing at the browser's
 * install icon instead, which is the standard advice and was rejected outright:
 * the reader is a parent who pressed a button, not somebody who is going to be
 * sent hunting through browser chrome. The state is also vanishingly rare --
 * on the machine where this was reported, three origins out of four hundred
 * and forty-eight were muted.
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
    // Set when Open is pressed; if we are back here, the hand-off did not
    // happen and offering Open again would just go round.
    var OPEN_TRIED_KEY = 'scratchjr-open-attempted';
    var APP_URL = '/app/index.html';

    // How long to give beforeinstallprompt before concluding it is not coming.
    // The event lands as soon as the manifest and icons are read, so this is
    // only long enough to keep the bar from changing under a reader's finger.
    var PROMPT_GRACE = 1500;

    var bar = document.getElementById('pwa-install-bar');
    var button = document.getElementById('pwa-install-btn');
    var steps = document.getElementById('pwa-install-ios');
    var openLink = document.getElementById('pwa-open-btn');
    var installed = document.getElementById('pwa-installed');

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

    /**
     * mode: 'install'   the default offer
     *       'ios'       Safari, where the Share sheet is the only route
     *       'installed' proven installed, and Open may hand off
     *       'find'      proven installed, but Open has already been tried
     */
    function show (mode) {
        bar.style.display = 'block';
        document.body.classList.add('pwa-bar-open');

        button.style.display = mode === 'install' ? 'block' : 'none';
        openLink.style.display = mode === 'installed' ? 'block' : 'none';
        steps.style.display = mode === 'ios' ? 'block' : 'none';
        installed.style.display = mode === 'find' ? 'block' : 'none';

        if (mode === 'install') {
            title.textContent = 'Install ScratchJr';
            sub.textContent = 'Get the app on this device. Works without internet.';
            later.textContent = 'Not now';
        } else if (mode === 'ios') {
            title.textContent = 'Install ScratchJr';
            sub.textContent = 'Add it to your Home Screen to get the app.';
            later.textContent = 'Got it';
        } else if (mode === 'installed') {
            title.textContent = 'ScratchJr is installed';
            sub.textContent = 'It is on this device, in its own window.';
            later.textContent = 'Not now';
        } else {
            title.textContent = 'ScratchJr is installed';
            sub.textContent = 'Your browser did not hand it over automatically.';
            later.textContent = 'Got it';
        }
    }

    // Not preventDefault()ed: the navigation is the whole point, and is what
    // Chromium may capture into the installed window.
    openLink.addEventListener('click', function () {
        try {
            window.sessionStorage.setItem(OPEN_TRIED_KEY, '1');
        } catch (e) {
            // Then a failed hand-off shows this bar again, which is no worse
            // than what a browser without link capturing does anyway.
        }
    });

    button.addEventListener('click', function () {
        if (!deferredPrompt) {
            // The browser has muted its own install offer on this origin and
            // nothing in a page can lift that. Say so in one line, in the bar.
            // No overlay, no arrow, and nothing about the browser's own chrome
            // -- a parent should never be sent to hunt through it.
            sub.textContent = 'Your browser is not offering the install right now.';
            return;
        }
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (choice) {
            deferredPrompt = null;
            if (choice.outcome === 'accepted') {
                show('installed');
                // appinstalled follows and says the same thing.
            } else {
                hide();
            }
        });
    });

    // Covers an install started from the browser's own address bar, which
    // never goes through the button.
    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        try {
            window.sessionStorage.removeItem(OPEN_TRIED_KEY);
        } catch (e) {
            // Nothing was stored.
        }
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

    function openAlreadyTried () {
        try {
            return window.sessionStorage.getItem(OPEN_TRIED_KEY) === '1';
        } catch (e) {
            return false;
        }
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
            if (!yes) {
                show('install');
            } else {
                show(openAlreadyTried() ? 'find' : 'installed');
            }
        });
    }, PROMPT_GRACE);
}());
