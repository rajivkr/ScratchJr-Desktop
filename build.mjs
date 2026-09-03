/*
 * Build the ScratchJr PWA.
 *
 *   dist/index.html      ScratchJr's own splash. It is the first page in both
 *                        directions: the front door of the site and the
 *                        start_url of the installed app.
 *   dist/                The rest of the app beside it, together with the
 *                        manifest, service worker and icons, so one scope at
 *                        the root covers the lot.
 *
 * There is no landing page. The app runs wherever it is opened -- a browser
 * tab is a perfectly good place to use it -- and the only thing a tab gets
 * that an installed window does not is the install bar across the bottom of
 * the splash. install-banner.js puts it there and takes itself out of the way
 * inside an installed window.
 *
 * The app keeps ScratchJr's own filenames because its pages navigate to each
 * other by relative name -- home.js and Lobby.js both go to 'index.html' --
 * which is exactly why the splash can sit at the root unaltered.
 *
 * It used to sit under /app/ instead, behind a landing page. A copy installed
 * back then still has /app/index.html as its start_url and keeps it until the
 * browser re-reads the manifest, so vercel.json redirects the old paths to the
 * new ones. vercel.json takes no comments; that is what this paragraph is for.
 *
 * The app's HTML is copied with only its two <script> tags rewritten: the
 * Electron client and the raw ES-module entry point are replaced by one
 * bundle. The splash gets the install bar's script as well. No other markup,
 * stylesheet, or image is touched.
 */

import * as esbuild from 'esbuild';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const appSrc = path.join(root, 'src', 'app');

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');

// Runtime asset directories: ScratchJr fetches these by path at runtime, so
// they are copied verbatim rather than being run through the bundler.
const ASSET_DIRS = [
    'assets', 'css', 'inapp', 'localizations', 'pnglibrary', 'samples', 'sounds', 'svglibrary'
];
const ASSET_FILES = ['media.json', 'settings.json'];
const PAGES = ['index.html', 'home.html', 'editor.html', 'gettingstarted.html'];

function log (...args) {
    console.log('[build]', ...args);
}

function rimraf (target) {
    fs.rmSync(target, {recursive: true, force: true});
}

function copyDir (from, to) {
    fs.cpSync(from, to, {recursive: true});
}

function walk (dir, base = dir, out = []) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, base, out);
        } else {
            out.push(path.relative(base, full).split(path.sep).join('/'));
        }
    }
    return out;
}

// ---- 1. Bundle the app ---------------------------------------------------

/**
 * Snap.svg 0.5.1 on npm does not survive modern bundlers, so the copy already
 * vendored in this repo is used instead. Only Snap.path.isPointInside is called.
 */
const snapAlias = {
    name: 'snap-alias',
    setup (build) {
        build.onResolve({filter: /^snapsvg$/}, () => ({
            path: path.join(root, 'web', 'snap-shim.js')
        }));
    }
};

const appBundle = {
    entryPoints: [path.join(root, 'web', 'entry.js')],
    outfile: path.join(dist, 'scratchjr.js'),
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    minify: !watch,
    sourcemap: watch,
    legalComments: 'none',
    plugins: [snapAlias],
    logLevel: 'info'
};

// ---- 2. Copy assets ------------------------------------------------------

function copyAppAssets () {
    for (const dir of ASSET_DIRS) {
        copyDir(path.join(appSrc, dir), path.join(dist, dir));
    }
    for (const file of ASSET_FILES) {
        fs.copyFileSync(path.join(appSrc, file), path.join(dist, file));
    }

    // Loaded as a classic script; see web/snap-shim.js for why.
    fs.copyFileSync(
        path.join(appSrc, 'src', 'snap', 'snap.svg-min.js'),
        path.join(dist, 'snap.svg-min.js')
    );

    // sql.js needs its WebAssembly module beside the app pages. esbuild resolves
    // the package's "browser" export, so it is the -browser build that is loaded
    // and its .wasm file that must be present under that exact name. Verified
    // against the bundle rather than assumed, since shipping the wrong one is a
    // silent failure at start-up and shipping both wastes 650KB of the shell.
    const wasm = 'sql-wasm-browser.wasm';
    const bundle = fs.readFileSync(path.join(dist, 'scratchjr.js'), 'utf8');
    if (!bundle.includes(wasm)) {
        throw new Error(`The bundle does not reference ${wasm}; check sql.js resolution`);
    }
    fs.copyFileSync(
        path.join(root, 'node_modules', 'sql.js', 'dist', wasm),
        path.join(dist, wasm)
    );
}

function copyInstallBanner () {
    // A classic script, loaded by the splash alone. Kept out of the bundle so
    // it runs and decides before ScratchJr's own start-up gets going.
    fs.copyFileSync(path.join(root, 'web', 'install-banner.js'), path.join(dist, 'install-banner.js'));
}

// ---- 3. Rewrite the app's HTML ------------------------------------------

const HEAD_TAGS = `<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#000000">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="ScratchJr">
<link rel="icon" href="/icons/icon-256.png">
<link rel="apple-touch-icon" href="/icons/icon-256.png">`;

function rewritePages () {
    for (const page of PAGES) {
        let html = fs.readFileSync(path.join(appSrc, page), 'utf8');

        // Drop the Electron bridge and the untranspiled module entry point.
        html = html.replace(/^[ \t]*<script src=['"]\.\.\/electronClient\.js['"]><\/script>\n?/m, '');
        html = html.replace(
            /^[ \t]*<script type="text\/javascript" src="appEntry\.js"><\/script>\n?/m,
            HEAD_TAGS + '\n<script src="snap.svg-min.js"></script>\n<script src="scratchjr.js"></script>\n'
        );

        if (html.includes('electronClient') || html.includes('appEntry.js')) {
            throw new Error('Failed to rewrite script tags in ' + page);
        }
        if (!html.includes('scratchjr.js')) {
            throw new Error('Bundle tag missing from ' + page);
        }

        // Only the splash offers the install. Nobody wants a bar across the
        // bottom of the editor, and the offer belongs at the first page
        // anyway, before a child is in the middle of something.
        if (page === 'index.html') {
            html = html.replace(
                '</body>',
                '<script src="/install-banner.js"></script>\n</body>'
            );
            if (!html.includes('install-banner.js')) {
                throw new Error('Install bar tag missing from ' + page);
            }
        }

        fs.writeFileSync(path.join(dist, page), html);
    }
}

// ---- 4. Sound manifest ---------------------------------------------------

/**
 * ScratchJr asks for sounds by bare filename. On the desktop the host searched
 * the app directory; here the lookup table is built once at build time so the
 * interface can resolve a name to a URL synchronously.
 */
function writeSoundManifest () {
    const manifest = {};
    const audio = /\.(wav|mp3|m4a|ogg|webm)$/i;

    for (const dir of ['sounds', 'samples', '']) {
        const from = dir ? path.join(appSrc, dir) : appSrc;
        if (!fs.existsSync(from)) {
            continue;
        }
        for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
            if (entry.isFile() && audio.test(entry.name)) {
                // First directory wins, matching the desktop search order.
                if (!manifest[entry.name]) {
                    manifest[entry.name] = dir ? dir + '/' + entry.name : entry.name;
                }
            }
        }
    }

    fs.writeFileSync(path.join(dist, 'sound-manifest.json'), JSON.stringify(manifest, null, 2));
    return Object.keys(manifest).length;
}

// ---- 4b. Stylesheet bundle -----------------------------------------------

/**
 * ScratchJr builds its stylesheets synchronously, before first paint, via
 * preprocessAndLoadCss(). A synchronous XMLHttpRequest is the only way to
 * serve that -- and Chrome does not route synchronous XHR through the service
 * worker, so it fails the moment the app is offline. Emitting the stylesheets
 * as one JSON file lets the host answer those reads from memory instead.
 */
function writeStyleBundle () {
    const styles = {};

    for (const dir of ['css', 'inapp/style']) {
        const from = path.join(appSrc, dir);
        for (const entry of fs.readdirSync(from)) {
            if (entry.endsWith('.css')) {
                const key = dir + '/' + entry;
                styles[key] = fs.readFileSync(path.join(from, entry), 'utf8');
            }
        }
    }

    // Written as a module so it is inlined into the bundle: the stylesheets
    // must be in hand before the first line of ScratchJr runs, which rules out
    // fetching them.
    fs.writeFileSync(
        path.join(root, 'web', 'styles.generated.js'),
        '// Generated by build.mjs. Do not edit.\nexport default ' + JSON.stringify(styles) + ';\n'
    );
    return Object.keys(styles).length;
}

// ---- 5. Icons ------------------------------------------------------------

// Only sizes that genuinely exist in src/icons/png. An earlier version
// declared sizes it did not have and resized with macOS `sips`, silently
// falling back to a copy of the 1024 icon when `sips` was missing. Vercel
// builds on Linux, so every "resized" icon shipped at 1024 with a size that
// lied about it -- and Chrome, which checks the real dimensions, rejected the
// icons and refused to treat the site as installable. No install prompt ever
// appeared in production while it worked perfectly on a Mac.
// 192 is here because Chromium's install criteria name it specifically, and
// because every manifest that installs without argument carries one. Ours went
// 128 -> 256 and skipped it.
const ICON_SIZES = [128, 192, 256, 512, 1024];

/** Read a PNG's real dimensions from its IHDR chunk. */
function pngSize (file) {
    const bytes = fs.readFileSync(file);
    return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

function writeIcons () {
    const iconsDist = path.join(dist, 'icons');
    fs.mkdirSync(iconsDist, {recursive: true});

    for (const size of ICON_SIZES) {
        const source = path.join(root, 'src', 'icons', 'png', `${size}x${size}.png`);
        if (!fs.existsSync(source)) {
            throw new Error(`Missing icon source ${size}x${size}.png`);
        }
        const target = path.join(iconsDist, `icon-${size}.png`);
        fs.copyFileSync(source, target);

        // The manifest is about to claim this icon is exactly this size, and
        // Chrome checks. Never let that claim go out unverified again.
        const actual = pngSize(target);
        if (actual.width !== size || actual.height !== size) {
            throw new Error(
                `icon-${size}.png is ${actual.width}x${actual.height}, not ${size}x${size}`
            );
        }
    }
    return ICON_SIZES.length;
}

// ---- 6. Manifest ---------------------------------------------------------

function writeWebManifest () {
    const manifest = {
        id: '/',
        name: 'ScratchJr',
        short_name: 'ScratchJr',
        description: 'ScratchJr - an introductory programming language for young children.',
        // One page for both readings of "the app": the site's front door and
        // the installed window's start_url are the same splash.
        scope: '/',
        start_url: '/',
        display: 'standalone',
        orientation: 'landscape',
        // A click that lands in scope should wake the installed window rather
        // than open a second copy of ScratchJr in a tab. Where link capturing
        // is off this simply navigates, which is no worse than before: the app
        // works in the tab too.
        launch_handler: {
            client_mode: ['focus-existing', 'auto']
        },
        background_color: '#000000',
        theme_color: '#000000',
        icons: ICON_SIZES.map((size) => ({
            src: `/icons/icon-${size}.png`,
            sizes: `${size}x${size}`,
            type: 'image/png',
            purpose: 'any'
        })).concat([{
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
        }])
    };
    fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
}

// ---- 7. Service worker ---------------------------------------------------

/**
 * Split the precache into the shell -- what is needed to open the app -- and
 * everything else. The worker caches the shell during install and activates
 * immediately; the rest is fetched afterwards, in the background. A browser
 * will not offer to install a site until a service worker is in control, so
 * install must not wait on 34MB of artwork.
 */
function isShell (file) {
    return file.endsWith('.html') ||
        file.endsWith('.js') ||
        file.endsWith('.wasm') ||
        file.endsWith('.webmanifest') ||
        file.endsWith('.css') ||
        file.startsWith('icons/') ||
        file.startsWith('localizations/') ||
        file === 'media.json' ||
        file === 'settings.json' ||
        file === 'sound-manifest.json';
}

function writeServiceWorker () {
    const files = walk(dist)
        .filter((file) => file !== 'sw.js');

    const shell = files.filter(isShell).map((file) => '/' + file);
    const rest = files.filter((file) => !isShell(file)).map((file) => '/' + file);

    // The splash is also reachable as the bare origin.
    shell.push('/');

    const fingerprint = createHash('sha256')
        .update(files.join('\n'))
        .update(fs.readFileSync(path.join(dist, 'scratchjr.js')))
        .digest('hex')
        .slice(0, 12);

    const template = fs.readFileSync(path.join(root, 'web', 'sw.js'), 'utf8');
    const sw = template
        .replace('__CACHE_NAME__', 'scratchjr-' + fingerprint)
        .replace('__SHELL__', JSON.stringify(shell))
        .replace('__REST__', JSON.stringify(rest));

    if (sw.includes('__SHELL__') || sw.includes('__REST__') || sw.includes('__CACHE_NAME__')) {
        throw new Error('Service worker placeholders were not all replaced');
    }

    fs.writeFileSync(path.join(dist, 'sw.js'), sw);

    const shellBytes = shell
        .filter((url) => url !== '/')
        .reduce((sum, url) => sum + fs.statSync(path.join(dist, url.slice(1))).size, 0);

    return {total: shell.length + rest.length, shell: shell.length, shellBytes};
}

// ---- Run -----------------------------------------------------------------

async function build () {
    const started = Date.now();
    rimraf(dist);
    fs.mkdirSync(dist, {recursive: true});

    const styles = writeStyleBundle();

    await esbuild.build(appBundle);

    copyAppAssets();
    copyInstallBanner();
    rewritePages();

    const sounds = writeSoundManifest();
    const icons = writeIcons();
    writeWebManifest();
    const sw = writeServiceWorker();

    const bytes = walk(dist).reduce((sum, file) => sum + fs.statSync(path.join(dist, file)).size, 0);
    log(`${sw.total} files (${sw.shell} in the shell, ${(sw.shellBytes / 1024).toFixed(0)} KB), ` +
        `${sounds} sounds, ${styles} stylesheets, ${icons} icons, ` +
        `${(bytes / 1048576).toFixed(1)} MB in ${Date.now() - started}ms`);
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.wasm': 'application/wasm',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function startServer (port = 4173) {
    createServer((req, res) => {
        const url = decodeURIComponent(req.url.split('?')[0]);
        let file = path.join(dist, url);
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
            file = path.join(file, 'index.html');
        }
        if (!file.startsWith(dist) || !fs.existsSync(file)) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        fs.createReadStream(file).pipe(res);
    }).listen(port, () => log(`serving http://localhost:${port}`));
}

await build();

if (serve) {
    startServer();
}
if (watch) {
    fs.watch(path.join(root, 'web'), {recursive: true}, () => build().catch(console.error));
    fs.watch(path.join(appSrc, 'src'), {recursive: true}, () => build().catch(console.error));
    log('watching for changes');
}
