## Official disclaimer
Scratch and ScratchJr are trademarks of Massachusetts Institute of Technology, which does not sponsor, endorse, or authorize this content. See scratchjr.org for more information.

## Install
Visit the site and press Install. Works on Mac, Windows, iPad and Android.

There is no landing page: the site is ScratchJr, and it runs wherever it is
opened. A browser tab gets the app plus an install bar across the bottom of the
splash; an installed window gets the app and nothing else. Installing is worth
it -- it is what makes ScratchJr work offline and open in its own window -- but
using it in a tab is a perfectly good answer too.


## The geeky stuff

This repository contains a port of ScratchJr that installs as a Progressive Web App
on Mac, Windows, iPad and Android.

It has been ported with love from the iPad / Android editions as an independent,
open source community project. It began life as an Electron desktop port; the
Electron shell has been replaced by a browser-based host so the app can be
installed from a URL with no download and no code-signing warnings.

If you are looking for the Official ScratchJr build from MIT for Android and iPad, visit
the LLK/ScratchJr (https://github.com/LLK/scratchjr) repository.


## Architecture Overview

ScratchJr talks to its host platform through a single object -- `window.tablet` on
iOS, `AndroidInterface` on Android. The web build supplies a fourth implementation
of that same contract, backed only by browser APIs.

* The HTML5 side of ScratchJr is unchanged from the original iOS / Android versions.
* `web/tablet.js` implements the host interface: database, files, sound, recording, camera.
* `web/db.js` holds the project database in memory with sql.js and mirrors it to IndexedDB.
* `web/audio.js` and `web/camera.js` handle sound recording and the paint editor's camera.
* `web/sw.js` precaches the whole app so it runs with no internet connection.
* `web/install-banner.js` is the install bar: it brings its own markup and styles,
  is loaded by the splash alone, and does nothing at all inside an installed window.

The bar makes one offer, Install, and takes `Not now` for an answer for the rest
of the session. It does not try to work out what the browser is up to: silence
from `beforeinstallprompt` proves nothing, since a browser is equally silent
when the app is already installed and when it is muting its own install offer.

Three files in the original ScratchJr source were touched, all in the platform layer:
`iPad/iOS.js` (resources resolve asynchronously so they can come from the offline
cache), `utils/lib.js` (stylesheet expressions no longer go through `eval`, which a
minifier breaks), and `utils/Localization.js` (dropped the `intl` polyfill, which
modern browsers make unnecessary).


## Storage

The database is the same format as the original iOS / Android version, plus a
PROJECTFILES table holding media inline rather than as loose files. It lives in
IndexedDB on the device. Nothing is uploaded anywhere and there is no account to
create.


## Building

Requires Node.js.

    npm install
    npm run build      # writes dist/
    npm run dev        # build, watch, and serve on http://localhost:4173

`dist/` is a static directory: ScratchJr's splash at the root, the rest of the
app beside it, and the manifest, service worker and icons alongside so one
scope at the root covers everything. Deploying is a matter of serving it.
`vercel.json` configures a Vercel deployment, and redirects the `/app/` paths
an earlier layout used for anyone still carrying them.


## Debugging

    npm run dev

Then open http://localhost:4173 and use the browser's developer tools. That is
the app, install bar and all -- the same thing a visitor gets, so there is
nothing to install and no separate route to switch to.

Note that a browser mutes its own install offer on an origin once it has shown
it, and keeps that mute even after the app is uninstalled -- so the install bar
will not appear on any origin this has already been tested on. That is almost
always the reason a first-install flow cannot be reproduced. Three ways out,
cheapest first:

    # Ignore every engagement check and cooldown, so beforeinstallprompt
    # fires on every navigation.
    open -na "Google Chrome" --args --bypass-app-banner-engagement-checks

* Click the icon left of the URL, then Site settings, then Delete data. That
  clears the origin's `app_banner` content setting along with its storage.
* Or use a fresh profile, or a different port on localhost -- the mute is
  per-origin.

To test offline behaviour, load the app once so the service worker precaches it,
then stop the dev server and reload.


## Directory Structure

* <tt>web/</tt> - The browser host: window.tablet, database, sound, camera, service worker, install bar
* <tt>build.mjs</tt> - Bundles the app, copies assets, and generates the manifest, icons and service worker
* <tt>src/app/</tt> - ScratchJr itself, shared with the iOS and Android editions. Most feature and UI changes belong here.
* <tt>src/icons/</tt> - Source icons
* <tt>dist/</tt> - Build output (not checked in)
* <tt>docs/</tt> - Developer documentation


## Acknowledgments

Thank you to the official Scratch team and their supporters.  Their contributions are listed here:
https://github.com/LLK/scratchjr

In addition, thank you to the folks working on Sql.js, Snap.svg and esbuild, and to
the authors of the original Electron desktop port this build grew out of.


## Disclaimers

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


For more information, see [CONTRIBUTING.md](CONTRIBUTING.md).

