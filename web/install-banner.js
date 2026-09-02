/*
 * The install banner on the landing page.
 *
 * Laid out after the install banner in Norven: fixed across the bottom in the
 * brand colour, the app's own icon on a white tile, and two full-width buttons
 * stacked so there is nothing to aim at. iPad Safari cannot be driven from
 * script, so it gets the three steps written out instead.
 *
 * It appears only when there is something to press. If the browser has not
 * offered an install -- because ScratchJr is already here, or because Chromium
 * mutes its own offer on an origin for a fortnight after showing it once --
 * the banner stays down and the page is just a page. A button that cannot
 * install, or one that says Open and comes back to where it started, is worse
 * than no button at all; an earlier version shipped both and they dead-ended.
 */

(function () {
    'use strict';

    var DISMISSED_KEY = 'scratchjr-install-dismissed';
    var APP_URL = '/app/index.html';

    // ScratchJr's splash blue darkened enough to carry white text, so the bar
    // reads as part of the app rather than bolted on.
    var BRAND = '#166E96';

    var deferredPrompt = null;
    var shown = false;

    function isStandalone () {
        return window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: window-controls-overlay)').matches ||
            window.navigator.standalone === true;
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

    function rememberDismissal () {
        try {
            window.sessionStorage.setItem(DISMISSED_KEY, '1');
        } catch (e) {
            // Private browsing. The banner simply offers again next time.
        }
    }

    var STYLES = [
        '@keyframes sjrSlideUp {',
        '  from { opacity: 0; transform: translateY(100%); }',
        '  to   { opacity: 1; transform: translateY(0); }',
        '}',
        '#sjr-install {',
        '  position: fixed; left: 0; right: 0; bottom: 0; z-index: 99999;',
        '  background: ' + BRAND + ';',
        '  box-shadow: 0 -4px 32px rgba(0, 0, 0, .32);',
        '  animation: sjrSlideUp .3s ease;',
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
        '}',
        '#sjr-install.sjr-out { animation: sjrSlideUp .25s ease reverse forwards; }',
        '#sjr-install .sjr-inner { max-width: 520px; margin: 0 auto; padding: 20px 20px 26px; }',
        '#sjr-install .sjr-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }',
        '#sjr-install .sjr-tile {',
        '  width: 48px; height: 48px; border-radius: 12px; background: #fff; flex-shrink: 0;',
        '  display: flex; align-items: center; justify-content: center; overflow: hidden;',
        '}',
        '#sjr-install .sjr-tile img { width: 40px; height: 40px; }',
        '#sjr-install .sjr-title { font-size: 16px; font-weight: 700; color: #fff; line-height: 1.3; }',
        '#sjr-install .sjr-sub { font-size: 12px; color: rgba(255, 255, 255, .75); line-height: 1.4; }',
        '#sjr-install .sjr-steps {',
        '  background: rgba(255, 255, 255, .12); border-radius: 12px; padding: 14px 16px;',
        '  margin-bottom: 12px; font-size: 13px; color: #fff; line-height: 1.7;',
        '}',
        '#sjr-install button {',
        '  width: 100%; display: block; border: none; border-radius: 12px; padding: 14px;',
        '  font-family: inherit; font-size: 15px; cursor: pointer;',
        '}',
        '#sjr-install .sjr-go { background: #fff; color: ' + BRAND + '; font-weight: 700; margin-bottom: 10px; }',
        '#sjr-install .sjr-go:hover { background: #f2f2f2; }',
        '#sjr-install .sjr-later { background: rgba(255, 255, 255, .15); color: #fff; font-weight: 600; }',
        '#sjr-install .sjr-later:hover { background: rgba(255, 255, 255, .24); }'
    ].join('\n');

    function render (mode) {
        if (shown || document.getElementById('sjr-install')) {
            return;
        }
        shown = true;

        var style = document.createElement('style');
        style.textContent = STYLES;
        document.head.appendChild(style);

        var bar = document.createElement('div');
        bar.id = 'sjr-install';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', 'Install ScratchJr');

        var head =
            '<div class="sjr-head">' +
            '<div class="sjr-tile"><img src="/icons/icon-256.png" alt=""></div>' +
            '<div>' +
            '<div class="sjr-title">Install ScratchJr</div>' +
            '<div class="sjr-sub">Get the app on this device. Works without internet.</div>' +
            '</div></div>';

        var action = (mode === 'ios')
            ? '<div class="sjr-steps">' +
              '1. Tap the <b>Share</b> button <span style="font-size:16px">&#x2934;</span><br>' +
              '2. Scroll down and tap <b>Add to Home Screen</b><br>' +
              '3. Tap <b>Add</b> in the top right' +
              '</div>'
            : '<button type="button" class="sjr-go" data-action="install">Install App</button>';

        bar.innerHTML = '<div class="sjr-inner">' + head + action +
            '<button type="button" class="sjr-later" data-action="later">' +
            (mode === 'ios' ? 'Got it' : 'Not now') +
            '</button></div>';

        document.body.appendChild(bar);

        bar.addEventListener('click', function (event) {
            var target = event.target.closest && event.target.closest('[data-action]');
            if (!target) {
                return;
            }
            if (target.getAttribute('data-action') === 'install') {
                runInstall();
            } else {
                rememberDismissal();
                dismiss();
            }
        });
    }

    function dismiss () {
        var bar = document.getElementById('sjr-install');
        if (!bar) {
            return;
        }
        bar.classList.add('sjr-out');
        setTimeout(function () {
            bar.remove();
        }, 260);
    }

    function runInstall () {
        if (!deferredPrompt) {
            return;
        }
        var prompt = deferredPrompt;
        deferredPrompt = null;
        prompt.prompt();
        prompt.userChoice.then(function (choice) {
            if (choice.outcome === 'accepted') {
                dismiss();
            } else {
                // Declined. Leave the banner up; they may change their mind.
                deferredPrompt = prompt;
            }
        });
    }

    function start () {
        // The installed app has no business on the landing page. If it lands
        // here -- a bookmark, a shared link -- send it into ScratchJr.
        if (isStandalone()) {
            window.location.replace(APP_URL);
            return;
        }

        if (dismissedThisSession()) {
            return;
        }

        window.addEventListener('beforeinstallprompt', function (event) {
            // Suppress the browser's own mini-infobar; this asks properly.
            event.preventDefault();
            deferredPrompt = event;
            setTimeout(function () {
                render('install');
            }, 1200);
        });

        window.addEventListener('appinstalled', function () {
            deferredPrompt = null;
            dismiss();
        });

        if (isIOS()) {
            // Safari never fires beforeinstallprompt, so there is nothing to
            // wait for and the steps are the only route.
            setTimeout(function () {
                if (!deferredPrompt) {
                    render('ios');
                }
            }, 2000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, {once: true});
    } else {
        start();
    }
}());
