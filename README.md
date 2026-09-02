## Official disclaimer
Scratch and ScratchJr are trademarks of Massachusetts Institute of Technology, which does not sponsor, endorse, or authorize this content. See scratchjr.org for more information.

## Install
Visit the site and press Install. Works on Mac, Windows, iPad and Android.

ScratchJr only runs as an installed app. A browser tab shows the install screen
and nothing else; the app itself starts only in its own window.


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
* `web/install-gate.js` stands in front of the app in a browser tab and offers the install.
* `web/landing/` is the page people install from.

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

`dist/` is a static directory: the app at the root, the landing page at
`/about.html`. Deploying is a matter of serving it. `vercel.json` configures a
Vercel deployment.


## Debugging

    npm run dev

Then open http://localhost:4173 and use the browser's developer tools. localhost
is the one place the app runs in a tab without being installed, so development
does not mean reinstalling after every change. Add `?gate` to the URL to see the
install screen a real visitor gets.

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

