/*
 * The install bar across the bottom of the splash.
 *
 * ScratchJr itself is the site now: a browser tab opens the app, not a page
 * about the app. So the offer to install has to travel with the app, and this
 * file brings its own markup and its own styles rather than expecting a host
 * page to carry them. Loaded by dist/index.html alone -- nobody wants a bar
 * over the editor, and a child mid-project is the wrong moment to ask.
 *
 * One offer, every time: Install. No open-instead, no already-installed, no
 * detection of what the browser might be up to. The bar is up for anyone who
 * is not already inside the installed app, the button prompts when the browser
 * gives us a prompt, and that is the whole of it.
 *
 * Deliberately short. It sits over ScratchJr's splash, which fills the window
 * and has a start button in the middle of it, so the bar is a single row along
 * the bottom edge and gets out of the way the moment it is dismissed.
 */

(function () {
    'use strict';

    var DISMISSED_KEY = 'scratchjr-install-dismissed';

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

    // Before anything is built or any listener attached. Inside the installed
    // app this file does nothing at all.
    if (isInstalledWindow()) {
        return;
    }

    try {
        if (window.sessionStorage.getItem(DISMISSED_KEY) === '1') {
            return;
        }
    } catch (e) {
        // Private browsing. The bar simply offers again next time.
    }

    function isIOS () {
        var ua = window.navigator.userAgent;
        return /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    /*
     * The media query is a killswitch, not decoration: if this script ever runs
     * in an installed window despite the check above -- a browser that reports
     * standalone late, a display mode that changes under us -- the bar cannot
     * render, whatever the JavaScript believes.
     */
    var CSS = [
        '@media all and (display-mode: standalone), (display-mode: window-controls-overlay) {',
        '  #pwa-install-bar { display: none !important; }',
        '}',
        '@keyframes pwaSlideUp {',
        '  from { opacity: 0; transform: translateY(100%); }',
        '  to   { opacity: 1; transform: translateY(0); }',
        '}',
        '#pwa-install-bar {',
        '  position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483000;',
        '  background: #166E96; box-shadow: 0 -4px 32px rgba(0, 0, 0, .32);',
        '  animation: pwaSlideUp .3s ease;',
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
        '  -webkit-user-select: none; user-select: none;',
        '}',
        '#pwa-install-bar .pwa-inner {',
        '  display: flex; align-items: center; gap: 14px;',
        '  max-width: 900px; margin: 0 auto; padding: 12px 16px;',
        '}',
        '#pwa-install-bar .pwa-tile {',
        '  width: 40px; height: 40px; border-radius: 10px; background: #fff;',
        '  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;',
        '  overflow: hidden;',
        '}',
        '#pwa-install-bar .pwa-tile img { width: 34px; height: 34px; }',
        '#pwa-install-bar .pwa-text { flex: 1 1 auto; min-width: 0; }',
        '#pwa-install-bar .pwa-title {',
        '  font-size: 15px; font-weight: 700; color: #fff; line-height: 1.3;',
        '}',
        '#pwa-install-bar .pwa-sub {',
        '  font-size: 12px; color: rgba(255, 255, 255, .75); line-height: 1.4;',
        '}',
        '#pwa-install-bar .pwa-steps {',
        '  flex: 1 1 auto; background: rgba(255, 255, 255, .12); border-radius: 10px;',
        '  padding: 8px 12px; font-size: 12px; color: #fff; line-height: 1.6;',
        '}',
        '#pwa-install-bar button {',
        '  flex: 0 0 auto; border: none; border-radius: 10px; padding: 11px 18px;',
        '  font-family: inherit; font-size: 14px; cursor: pointer;',
        '}',
        '#pwa-install-btn { background: #fff; color: #166E96; font-weight: 700; }',
        '#pwa-install-btn:hover { background: #f2f2f2; }',
        '#pwa-install-later {',
        '  background: rgba(255, 255, 255, .15); color: #fff; font-weight: 600;',
        '}',
        '#pwa-install-later:hover { background: rgba(255, 255, 255, .24); }',
        /*
         * A phone or a narrow window: the row becomes a stack, because a
         * 14-pixel-wide title beside two buttons is worse than either.
         */
        '@media (max-width: 560px) {',
        '  #pwa-install-bar .pwa-inner { flex-wrap: wrap; }',
        '  #pwa-install-bar .pwa-text { flex-basis: calc(100% - 54px); }',
        '  #pwa-install-bar .pwa-steps { flex-basis: 100%; }',
        '  #pwa-install-bar button { flex: 1 1 0; }',
        '}'
    ].join('\n');

    var HTML = [
        '<div class="pwa-inner">',
        '  <div class="pwa-tile"><img src="/icons/icon-256.png" alt=""></div>',
        '  <div class="pwa-text">',
        '    <div class="pwa-title">Install ScratchJr</div>',
        '    <div class="pwa-sub">Get the app on this device. Works without internet.</div>',
        '  </div>',
        '  <div class="pwa-steps" id="pwa-install-ios">',
        '    Tap <b>Share</b>, then <b>Add to Home Screen</b>, then <b>Add</b>.',
        '  </div>',
        '  <button type="button" id="pwa-install-btn">Install App</button>',
        '  <button type="button" id="pwa-install-later">Not now</button>',
        '</div>'
    ].join('\n');

    var bar = null;

    function hide () {
        if (bar) {
            bar.style.display = 'none';
        }
    }

    // Safari fires no beforeinstallprompt and never will, so the iPad -- the
    // device ScratchJr was written for -- gets the Share sheet steps in place
    // of the button. Everywhere else gets the button.
    function build () {
        var iosSteps = isIOS();

        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        bar = document.createElement('div');
        bar.id = 'pwa-install-bar';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', 'Install ScratchJr');
        bar.innerHTML = HTML;
        document.body.appendChild(bar);

        var button = bar.querySelector('#pwa-install-btn');
        var steps = bar.querySelector('#pwa-install-ios');
        var later = bar.querySelector('#pwa-install-later');

        button.style.display = iosSteps ? 'none' : 'block';
        steps.style.display = iosSteps ? 'block' : 'none';
        later.textContent = iosSteps ? 'Got it' : 'Not now';

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

    // The script tag sits at the end of <body>, but ScratchJr's start-up runs
    // on window.onload and rearranges the page it finds; appending after that
    // keeps the bar out of anything the splash does to its own frame.
    if (document.readyState === 'complete') {
        build();
    } else {
        window.addEventListener('load', build);
    }
}());
