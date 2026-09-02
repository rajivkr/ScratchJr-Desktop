/*
 * The install bar on the landing page.
 *
 * The markup and every style live in the landing page itself; this file only
 * decides what the browser will honour and reveals that much. Three things are
 * true before a line of this runs:
 *
 *   - The bar, the button and the iPad steps are all display:none in CSS, so
 *     nothing can flash while this is deciding.
 *   - A media query hides the button outright inside an installed window, with
 *     !important, so it beats any inline display set below. The JavaScript is
 *     not the only thing standing between the installed app and this bar.
 *   - This exits before attaching a single listener if it is already running
 *     inside the installed app.
 *
 * Laid out after the install banner in Norven: fixed across the bottom in the
 * brand colour, the app's own icon on a white tile, two full-width buttons
 * stacked so there is nothing to aim at.
 */

(function () {
    'use strict';

    var DISMISSED_KEY = 'scratchjr-install-dismissed';
    var APP_URL = '/app/index.html';

    var bar = document.getElementById('pwa-install-bar');
    var button = document.getElementById('pwa-install-btn');
    var steps = document.getElementById('pwa-install-ios');
    var later = document.getElementById('pwa-install-later');

    var deferredPrompt = null;

    /*
     * A window that must not be offered an install: the installed app, in any
     * of the shapes it can take.
     */
    var isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        window.navigator.standalone === true;

    /*
     * A window that really is the installed app -- which is a narrower thing.
     *
     * display-mode: fullscreen belongs in the test above, because the button
     * must never appear in an installed window and an app launched fullscreen
     * reports it. It cannot be used to decide a redirect: a plain browser
     * window put into fullscreen reports it too. Measured on this machine --
     * a normal Chrome tab in a macOS fullscreen window matches it.
     *
     * Redirecting on that sent a fullscreen browser to /app/, which is not
     * standalone, so the app sent it back to the landing page, which sent it
     * to /app/ again: a loop with no way out but leaving fullscreen. So the
     * redirect asks only what an installed window can actually be.
     */
    function isInstalledWindow () {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: window-controls-overlay)').matches ||
            window.navigator.standalone === true;
    }

    // Standalone early exit. Checked before any listener is attached, so the
    // installed app carries none of this.
    if (isStandalone) {
        // The installed app has no business on the landing page. If it lands
        // here -- a bookmark, a shared link -- send it into ScratchJr.
        if (isInstalledWindow()) {
            window.location.replace(APP_URL);
        }
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

    function show (element) {
        bar.style.display = 'block';
        element.style.display = 'block';
        document.body.classList.add('pwa-bar-open');
    }

    function hide () {
        bar.style.display = 'none';
        button.style.display = 'none';
        steps.style.display = 'none';
        document.body.classList.remove('pwa-bar-open');
    }

    if (dismissedThisSession()) {
        return;
    }

    // The one thing that reveals the button. Nothing else does.
    window.addEventListener('beforeinstallprompt', function (event) {
        // Suppress the browser's own mini-infobar; the bar asks properly.
        event.preventDefault();
        deferredPrompt = event;
        show(button);
    });

    button.addEventListener('click', function () {
        if (!deferredPrompt) {
            return;
        }
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
            deferredPrompt = null;
            hide();
        });
    });

    // Covers an install started from the browser's own address bar, which
    // never goes through the button.
    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        hide();
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
    // device ScratchJr was written for -- would otherwise have no way in at
    // all. It gets the Share sheet steps in place of the button.
    if (isIOS()) {
        setTimeout(function () {
            if (!deferredPrompt) {
                show(steps);
            }
        }, 2000);
    }
}());
