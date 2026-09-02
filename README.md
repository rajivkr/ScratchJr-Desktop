## Official disclaimer
Scratch and ScratchJr are trademarks of Massachusetts Institute of Technology, which does not sponsor, endorse, or authorize this content. See scratchjr.org for more information.

## Install
Visit the site and press Install. Works on Mac, Windows, iPad and Android.

ScratchJr only runs as an installed app. A browser gets the landing page, with
the install offer across the bottom of it; the app itself starts only in its
own window. A browser tab that reaches an app URL is sent to the landing page.


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
* `web/standalone-only.js` decides whether this window may run the app, and redirects it if not.
* `web/landing/` and `web/install-banner.js` are the page people install from.

The install bar picks between offering an install, offering to open an installed
copy, and saying neither is possible. Installed is only ever claimed on proof
from `navigator.getInstalledRelatedApps()`, which reports this app when the
manifest lists itself under `related_applications` and it was installed in the
same browser profile. Silence from `beforeinstallprompt` proves nothing: a
browser is equally silent when the app is installed and when it is muting its
own install offer.

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

`dist/` is a static directory: the landing page at the root, the app under
`/app/`, and the manifest, service worker and icons at the root so their scope
covers both. Deploying is a matter of serving it. `vercel.json` configures a
Vercel deployment.


## Debugging

    npm run dev

Then open http://localhost:4173 and use the browser's developer tools. The
landing page is at `/`, the app at `/app/index.html`. localhost is the one
place the app runs in a tab without being installed, so development does not
mean reinstalling after every change; add `?landing` to an app URL to take a
visitor's route instead.

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

* <tt>web/</tt> - The browser host: window.tablet, database, sound, camera, service worker, landing page
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

