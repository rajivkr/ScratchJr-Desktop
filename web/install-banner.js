/*
 * The install bar on the landing page.
 *
 * The bar is up for every reader who has not already installed ScratchJr, and
 * it always has a button. Which button depends on what the browser will let
 * this page do:
 *
 *   Install App     the browser fired beforeinstallprompt, so pressing it
 *                   opens the browser's own install dialog. The usual case.
 *   Open ScratchJr  it did not, so pressing it opens the app in this tab.
 *
 * Waiting for beforeinstallprompt before showing anything was the last version
 * and it was wrong. Chromium mutes its own install offer on an origin for a
 * fortnight after showing it once, so on any machine that had already been
 * asked -- every machine this was developed on, and every parent who pressed
 * Cancel once -- the page had no bar at all and no way to reach ScratchJr.
 * There is no API that installs without that event, so the honest second
 * button opens the app rather than pretending or explaining.
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
    var OPEN_KEY = 'scratchjr-open-in-browser';
    var APP_URL = '/app/index.html';

    // How long to give beforeinstallprompt before showing Open instead. The
    // event lands as soon as the manifest and icons are read, so this is only
    // long enough to avoid the button changing under a reader's finger.
    var PROMPT_GRACE = 1500;

    var bar = document.getElementById('pwa-install-bar');
    var button = document.getElementById('pwa-install-btn');
    var steps = document.getElementById('pwa-install-ios');
    var later = document.getElementById('pwa-install-later');

    var deferredPrompt = null;

    /*
     * Is this the installed app?
     *
     * Deliberately not display-mode: fullscreen. A plain browser window put
     * into macOS fullscreen matches it -- measured twice on this machine, and
     * both times it took the bar away from an ordinary reader who had done
     * nothing but fill their screen. It protects against nothing here either:
     * the manifest asks for display: standalone, so an installed ScratchJr
     * window reports standalone, never fullscreen. Standalone, the
     * window-controls-overlay variant of it, and Safari's own flag are the
     * whole of what an installed copy can be.
     */
    function isInstalledWindow () {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: window-controls-overlay)').matches ||
            window.navigator.standalone === true;
    }

    // Early exit, before a single listener is attached, so the installed app
    // carries none of this.
    if (isInstalledWindow()) {
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

    var sub = bar.querySelector('.pwa-sub');

    /** mode: 'install' (a real prompt in hand), 'open', or 'ios'. */
    function show (mode) {
        bar.style.display = 'block';
        document.body.classList.add('pwa-bar-open');

        if (mode === 'ios') {
            steps.style.display = 'block';
            button.style.display = 'none';
            sub.textContent = 'Add it to your Home Screen to get the app.';
            return;
        }

        steps.style.display = 'none';
        button.style.display = 'block';

        if (mode === 'install') {
            button.textContent = 'Install App';
            sub.textContent = 'Get the app on this device. Works without internet.';
        } else {
            button.textContent = 'Open ScratchJr';
            sub.textContent = 'Open it here, or install it from your browser for an icon of its own.';
        }
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

    // Whenever the offer arrives -- before the grace period is up or long
    // after it -- the button becomes Install.
    window.addEventListener('beforeinstallprompt', function (event) {
        // Suppress the browser's own mini-infobar; the bar asks properly.
        event.preventDefault();
        deferredPrompt = event;
        show('install');
    });

    button.addEventListener('click', function () {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function () {
                deferredPrompt = null;
                hide();
            });
            return;
        }

        // Nothing to install with. Open ScratchJr instead -- the flag is what
        // stops the app bouncing this tab back here.
        try {
            window.sessionStorage.setItem(OPEN_KEY, '1');
        } catch (e) {
            // Storage is off; the query string carries it instead.
        }
        window.location.href = APP_URL + '?open';
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
    // device ScratchJr was written for -- gets the Share sheet steps in place
    // of the button. It is the only route Safari has.
    if (isIOS()) {
        show('ios');
        return;
    }

    // Up either way. If the offer has not arrived by now it is not coming on
    // this visit, so put Open there rather than nothing.
    setTimeout(function () {
        if (!deferredPrompt) {
            show('open');
        }
    }, PROMPT_GRACE);
}());
