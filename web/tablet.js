/*
 * window.tablet for the browser.
 *
 * ScratchJr talks to its host platform through a single object -- `window.tablet`
 * on iOS, `AndroidInterface` on Android, and the Electron IPC bridge on desktop.
 * This is the fourth implementation of that same contract, backed by browser
 * APIs only. Every method keeps the original's synchronous signature and return
 * shape, because ScratchJr's own code consumes the return values immediately.
 *
 * Nothing above this file changes: the app, its artwork, and its behaviour are
 * exactly as MIT shipped them.
 */

import md5 from './md5.js';
import AudioCapture from './audio.js';
import CameraPickerDialog from './camera.js';
import * as DB from './db.js';
import styles from './styles.generated.js';

// filename -> URL for sounds that ship with the app, generated at build time.
let soundManifest = {};


export function setSoundManifest (manifest) {
    soundManifest = manifest || {};
}

/** Extension -> mime type, for rebuilding data: URLs of stored recordings. */
const AUDIO_MIME = {
    wav: 'audio/wav',
    mp3: 'audio/mp3',
    webm: 'audio/webm',
    mp4: 'audio/mp4',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4'
};

function extensionOf (name) {
    const dot = String(name).lastIndexOf('.');
    return dot < 0 ? '' : String(name).slice(dot + 1).toLowerCase();
}

export default class WebTabletInterface {

    constructor () {
        this.currentAudio = {};
        // Cache for the chunked media reads ScratchJr does when loading a project.
        this.mediaStrings = {};
        this.audioCaptureElement = null;
        this.cameraPickerDialog = null;
    }

    // ---- Database ---------------------------------------------------------

    database_stmt (json) {
        return DB.stmt(json);
    }

    database_query (json) {
        return JSON.stringify(DB.query(json));
    }

    // ---- Settings ---------------------------------------------------------

    io_getsettings () {
        // path, debug state, microphone permission, camera permission.
        // Permissions are requested lazily by the browser at the point of use,
        // so both are reported as available and the browser asks if needed.
        return 'scratchjr,false,YES,YES';
    }

    // ---- Files (stored in the PROJECTFILES table) -------------------------

    io_getmedia (file) {
        return DB.readProjectFile(file);
    }

    io_getmedialen (file, key) {
        const encoded = DB.readProjectFile(file);
        this.mediaStrings[key] = encoded;
        return encoded ? encoded.length : 0;
    }

    io_getmediadata (key, offset, length) {
        const media = this.mediaStrings[key];
        if (!media) {
            return null;
        }
        return media.substring(offset, offset + length);
    }

    io_getmediadone (key) {
        delete this.mediaStrings[key];
        return true;
    }

    io_setmedia (base64ContentStr, ext) {
        const filename = md5(base64ContentStr) + '.' + ext;
        DB.saveToProjectFiles(filename, base64ContentStr);
        return filename;
    }

    io_setmedianame (encodedData, key, ext) {
        const filename = key + '.' + ext;
        DB.saveToProjectFiles(filename, encodedData);
        return filename;
    }

    io_getmd5 (str) {
        return str ? md5(str) : null;
    }

    io_remove (filename) {
        DB.removeProjectFile(filename);
        return true;
    }

    io_cleanassets (fileType) {
        DB.cleanProjectFiles(fileType);
        return true;
    }

    io_getfile (str) {
        return DB.readProjectFile(str);
    }

    io_setfile (name, contents) {
        return DB.saveToProjectFiles(name, contents) ? name : -1;
    }

    /**
     * Read a text file that ships with the app: stylesheets, localisations,
     * media.json, and the SVGs behind the character and background libraries.
     *
     * Two paths, because ScratchJr asks in two different ways:
     *
     *  - With a callback (IO.requestFromServer): answered asynchronously with
     *    fetch(), which the service worker serves from the offline cache.
     *
     *  - Without one (preprocessAndLoadCss, which must build the stylesheets
     *    before first paint): answered from the preloaded style bundle. This
     *    cannot use a synchronous XMLHttpRequest, because Chrome does not route
     *    those through the service worker -- they fail as soon as the device is
     *    offline, which is exactly when an installed app needs to work.
     */
    io_gettextresource (filename, fcn) {
        if (!fcn) {
            if (Object.prototype.hasOwnProperty.call(styles, filename)) {
                return styles[filename];
            }
            console.log('No preloaded copy of', filename); // eslint-disable-line no-console
            return null;
        }

        fetch(filename)
            .then((response) => (response.ok ? response.text() : null))
            .catch((e) => {
                console.log('Could not read', filename, e); // eslint-disable-line no-console
                return null;
            })
            .then(fcn);

        // Tells iOS.gettextresource that the callback is ours to fire.
        return undefined;
    }

    // ---- Sound playback ---------------------------------------------------

    /**
     * Sounds come from two places: files shipped with the app (UI clicks, the
     * sample projects' sounds) and recordings the child made, which live in the
     * database. Shipped sounds are played straight from their URL rather than
     * being round-tripped through base64, which is what the desktop build did.
     */
    io_registersound (dir, name) {
        if (this.currentAudio[name]) {
            return;
        }

        const url = soundManifest[name] || soundManifest[String(name).split('/').pop()];
        if (url) {
            this.loadSoundFromUrl(name, url);
            return;
        }

        const stored = DB.readProjectFile(name);
        if (!stored) {
            console.log('Could not find sound', name); // eslint-disable-line no-console
            return;
        }

        // Recordings are stored as bare base64; older ones may carry a data: prefix.
        const src = stored.startsWith('data:')
            ? stored
            : 'data:' + (AUDIO_MIME[extensionOf(name)] || 'audio/webm') + ';base64,' + stored;
        this.loadSoundFromUrl(name, src);
    }

    loadSoundFromUrl (name, url) {
        if (!url || !name) {
            return;
        }
        const audio = new Audio(url);
        audio.volume = 0.8; // don't oversaturate the speakers
        audio.onended = () => {
            // ScratchJr waits for this before moving to the next block.
            window.iOS.soundDone(name);
        };
        this.currentAudio[name] = audio;
    }

    io_playsound (name) {
        const audioElement = this.currentAudio[name];
        if (!audioElement) {
            // Tell ScratchJr the sound finished anyway, or a green block stalls.
            setTimeout(() => window.iOS.soundDone(name), 1);
            return;
        }
        try {
            audioElement.currentTime = 0;
            const playPromise = audioElement.play();
            if (playPromise !== undefined) {
                playPromise.catch((error) => {
                    console.log('Could not play sound', name, error); // eslint-disable-line no-console
                    window.iOS.soundDone(name);
                });
            }
        } catch (e) {
            console.log('Could not play sound', name, e); // eslint-disable-line no-console
            window.iOS.soundDone(name);
        }
    }

    io_stopsound (name) {
        const audioElement = this.currentAudio[name];
        if (audioElement) {
            audioElement.pause();
        }
    }

    // ---- Sound recording --------------------------------------------------

    getAudioCaptureElement () {
        if (!this.audioCaptureElement) {
            this.audioCaptureElement = new AudioCapture();
            this.audioCaptureElement.isRecordingPermitted = true;
        }
        return this.audioCaptureElement;
    }

    recordsound_recordstart () {
        return this.getAudioCaptureElement().startRecord();
    }

    recordsound_recordstop () {
        this.getAudioCaptureElement().stopRecord();
    }

    recordsound_volume () {
        return this.getAudioCaptureElement().getVolume();
    }

    recordsound_startplay () {
        this.getAudioCaptureElement().startPlay();
    }

    recordsound_stopplay () {
        this.getAudioCaptureElement().stopPlay();
    }

    /** Called when the record dialog closes; keep is 'YES' to save the take. */
    recordsound_recordclose (keep) {
        const capture = this.getAudioCaptureElement();
        try {
            if (keep === 'YES') {
                const blob = capture.captureRecordingAsBlob();
                if (blob) {
                    const filename = capture.getId();
                    const ext = capture.format.ext;
                    const reader = new FileReader();
                    reader.onload = () => {
                        // Store bare base64 so the recording survives a project
                        // export the same way sprites and backgrounds do.
                        const dataUri = reader.result;
                        const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
                        this.io_setmedianame(base64, filename, ext);
                        this.loadSoundFromUrl(filename + '.' + ext, dataUri);
                    };
                    reader.readAsDataURL(blob);
                }
            }
        } catch (e) {
            console.log('Error saving sound', e); // eslint-disable-line no-console
        } finally {
            capture.releaseMicrophone();
        }
    }

    askForPermission () {
        // The browser prompts at the moment the microphone is first used.
        return true;
    }

    // ---- Camera -----------------------------------------------------------

    scratchjr_cameracheck () {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    scratchjr_startfeed (str) {
        const data = JSON.parse(str);
        if (!this.cameraPickerDialog) {
            this.cameraPickerDialog = new CameraPickerDialog(data);
            this.cameraPickerDialog.show();
        }
    }

    scratchjr_stopfeed () {
        if (this.cameraPickerDialog) {
            this.cameraPickerDialog.hide();
            this.cameraPickerDialog = null;
        }
    }

    scratchjr_choosecamera (mode) {
        // Front/back switching is only meaningful on a phone; the desktop build
        // did not implement it either.
    }

    scratchjr_captureimage () {
        if (!this.cameraPickerDialog) {
            return;
        }
        const imgData = this.cameraPickerDialog.snapshot();
        if (imgData) {
            window.Camera.processimage(imgData.split(',')[1]);
        }
    }

    // ---- Host ------------------------------------------------------------

    hideSplash () {
        return true;
    }

    deviceName () {
        return 'desktop';
    }

    analyticsEvent (category, action, label, value) {
        // No analytics in this build.
    }

    /**
     * Share a project. ScratchJr hands us a base64 .sjr file; the browser either
     * offers the native share sheet (iPad, Android, recent macOS) or falls back
     * to a download, which is what a desktop install gets.
     */
    sendSjrUsingShareDialog (fileName, emailSubject, emailBody, shareType, b64data) {
        try {
            const binary = atob(b64data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], {type: 'application/octet-stream'});
            const file = new File([blob], fileName, {type: 'application/octet-stream'});

            if (navigator.canShare && navigator.canShare({files: [file]})) {
                navigator.share({files: [file], title: emailSubject}).catch(() => {
                    this.downloadBlob(blob, fileName);
                });
                return;
            }
            this.downloadBlob(blob, fileName);
        } catch (e) {
            console.log('Could not share project', e); // eslint-disable-line no-console
        }
    }

    downloadBlob (blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
}
