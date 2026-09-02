/*
 * The install bar on the landing page.
 *
 * One offer, every time: Install. No open-instead, no already-installed, no
 * detection of what the browser might be up to. The bar is up for anyone who
 * is not already inside the installed app, the button prompts when the browser
 * gives us a prompt, and that is the whole of it.
 *
 * The markup and every style live in the landing page itself, hidden in CSS
 * until this reveals them, with a media query that hides them again inside an
 * installed window regardless of what this file does.
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
     * Is this the installed app?
     *
     * Deliberately not display-mode: fullscreen. A plain browser window put
     * into macOS fullscreen matches it, and testing for it took the bar away
     * from readers who had done nothing but fill their screen. The manifest
     * asks for display: standalone, so an installed window reports standalone
     * and never fullscreen; nothing is lost by leaving it out.
     */
    function isInstalledWindow () {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: window-controls-overlay)').matches ||
            window.navigator.standalone === true;
    }

    // Before any listener is attached, so the installed app carries none of
    // this. It has no business on the landing page either: send it to ScratchJr.
    if (isInstalledWindow()) {
        window.location.replace(APP_URL);
        return;
    }

    function isIOS () {
        var ua = window.navigator.userAgent;
        return /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function show (iosSteps) {
        bar.style.display = 'block';
        button.style.display = iosSteps ? 'none' : 'block';
        steps.style.display = iosSteps ? 'block' : 'none';
        later.textContent = iosSteps ? 'Got it' : 'Not now';
        document.body.classList.add('pwa-bar-open');
    }

    function hide () {
        bar.style.display = 'none';
        button.style.display = 'none';
        steps.style.display = 'none';
        document.body.classList.remove('pwa-bar-open');
    }

    try {
        if (window.sessionStorage.getItem(DISMISSED_KEY) === '1') {
            return;
        }
    } catch (e) {
        // Private browsing. The bar simply offers again next time.
    }

    window.addEventListener('beforeinstallprompt', function (event) {
        // Suppress the browser's own mini-infobar; the bar asks properly.
        event.preventDefault();
        deferredPrompt = event;
    });

    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        hide();
    });

    button.addEventListener('click', function () {
        if (!deferredPrompt) {
            return;
        }
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (choice) {
            if (choice.outcome === 'accepted') {
                deferredPrompt = null;
                hide();
            }
            // Declined: keep the prompt and the bar. They may change their mind.
        });
    });

    later.addEventListener('click', function () {
        try {
            window.sessionStorage.setItem(DISMISSED_KEY, '1');
        } catch (e) {
            // Nothing to remember it with; the bar offers again next time.
        }
        hide();
    });

    // Safari fires no beforeinstallprompt and never will, so the iPad -- the
    // device ScratchJr was written for -- gets the Share sheet steps in place
    // of the button. Everywhere else gets the button.
    show(isIOS());
}());
