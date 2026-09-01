/*
 * Snap.svg is loaded as a classic script tag rather than bundled.
 *
 * The vendored snap.svg-min.js is a UMD build that pulls in `eve` via require()
 * when it detects a CommonJS environment, which no bundler can satisfy from a
 * single file. Loaded as a plain script it takes its browser branch and is
 * entirely self-contained.
 *
 * The lookup is lazy so this module does not care about script ordering.
 * ScratchJr uses exactly one thing from Snap: Snap.path.isPointInside().
 */

export default {
    get path () {
        return window.Snap.path;
    }
};
