/*
 * Microphone recording for the "record a sound" block.
 *
 * Ported from the Electron client's AudioCapture. Two things had to change to
 * work in a 2026 browser: the volume meter now uses an AnalyserNode instead of
 * the removed ScriptProcessorNode, and the recording format is negotiated with
 * MediaRecorder up front (Safari cannot produce WebM) so the filename ScratchJr
 * is handed at the start of the recording matches what we actually save.
 */

function uuid () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = (c === 'x') ? r : ((r & 0x3) | 0x8);
        return v.toString(16);
    });
}

/** Pick a container this browser can actually record. */
function chooseFormat () {
    const candidates = [
        {mimeType: 'audio/webm;codecs=opus', ext: 'webm', playType: 'audio/webm'},
        {mimeType: 'audio/webm', ext: 'webm', playType: 'audio/webm'},
        {mimeType: 'audio/mp4', ext: 'mp4', playType: 'audio/mp4'},
        {mimeType: 'audio/ogg;codecs=opus', ext: 'ogg', playType: 'audio/ogg'}
    ];
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        for (const candidate of candidates) {
            if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
                return candidate;
            }
        }
    }
    // Let the browser choose and hope for the best.
    return {mimeType: '', ext: 'webm', playType: 'audio/webm'};
}

export default class AudioCapture {

    constructor () {
        this.audioCtx = null;
        this.audioPlaybackElement = null;
        this.errorHandler = null;
        this.isRecordingPermitted = true;
        this.format = chooseFormat();
        this.chunks = null;
        this.savedBlob = null;
        this.currentStream = null;
        this.mediaRecorder = null;
        this.analyser = null;
        this.meterBuffer = null;
        this.mediaStreamSource = null;
    }

    getContext () {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Browsers start the context suspended until a user gesture; recording
        // always begins from a tap on the record button, so this is safe here.
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        return this.audioCtx;
    }

    getId (isNewRecording) {
        if (isNewRecording || !this.id) {
            this.id = uuid();
        }
        return this.id;
    }

    /** Returns the filename ScratchJr will store in the project. */
    startRecord (constraints) {
        this.savedBlob = null;
        this.chunks = null;

        const wanted = constraints || {audio: true};
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia(wanted).then(
                this.beginStartRecord.bind(this),
                this.onError.bind(this)
            );
        } else {
            this.onError(new Error('This browser cannot record audio'));
        }
        return this.getId(true) + '.' + this.format.ext;
    }

    beginStartRecord (stream) {
        if (!this.isRecordingPermitted) {
            this.stopStream(stream);
            return;
        }
        this.chunks = null;
        this.currentStream = stream;

        const options = this.format.mimeType ? {mimeType: this.format.mimeType} : undefined;
        try {
            this.mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            this.mediaRecorder = new MediaRecorder(stream);
        }
        this.mediaRecorder.ondataavailable = this.onRecordData.bind(this);
        this.mediaRecorder.start();

        this.startAudioMeter();
    }

    onError (e) {
        console.log('Audio recording error', e); // eslint-disable-line no-console
        if (this.errorHandler) {
            this.errorHandler(e);
        }
    }

    onRecordData (e) {
        if (!this.chunks) {
            this.chunks = [];
        }
        if (e.data && e.data.size > 0) {
            this.chunks.push(e.data);
        }
    }

    captureRecordingAsBlob () {
        if (this.savedBlob) {
            return this.savedBlob;
        }
        try {
            if ((!this.chunks || this.chunks.length === 0) &&
                this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.requestData();
            }
            if (!this.chunks || this.chunks.length === 0) {
                return null;
            }
            this.savedBlob = new Blob(this.chunks, {type: this.format.playType});
            this.chunks = [];
            return this.savedBlob;
        } catch (e) {
            console.log('Could not save recording', e); // eslint-disable-line no-console
            this.savedBlob = null;
            return null;
        }
    }

    stopStream (stream) {
        if (!stream) {
            return;
        }
        stream.getTracks().forEach((track) => track.stop());
    }

    stopRecord () {
        this.stopAudioMeter();

        if (this.mediaRecorder) {
            try {
                if (this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.requestData();
                    this.mediaRecorder.stop();
                }
            } catch (e) {
                console.log('Could not stop recorder', e); // eslint-disable-line no-console
            }
        }
        this.mediaRecorder = null;
    }

    /** Release the microphone so the browser stops showing the recording badge. */
    releaseMicrophone () {
        this.stopStream(this.currentStream);
        this.currentStream = null;
    }

    stopPlay () {
        if (this.audioPlaybackElement) {
            this.audioPlaybackElement.pause();
            this.audioPlaybackElement = null;
        }
    }

    startPlay () {
        if (this.mediaRecorder) {
            this.stopRecord();
        }

        const blob = this.captureRecordingAsBlob();
        if (!blob) {
            return;
        }
        // A blob URL avoids re-encoding the recording into base64 just to hear it.
        const url = URL.createObjectURL(blob);
        this.audioPlaybackElement = new Audio(url);
        this.audioPlaybackElement.volume = 0.8;
        this.audioPlaybackElement.onended = () => URL.revokeObjectURL(url);
        this.tryPlayAudio(this.audioPlaybackElement);
    }

    tryPlayAudio (audioElement) {
        try {
            const playPromise = audioElement.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {});
            }
        } catch (e) {
            console.log('Could not play sound', e); // eslint-disable-line no-console
        }
    }

    // ---- Volume meter -----------------------------------------------------
    //
    // ScratchJr polls getVolume() on a timer while the record dialog is open,
    // so the meter is read on demand rather than pushed from an audio callback.

    startAudioMeter () {
        if (!this.currentStream || this.analyser) {
            return;
        }
        const audioContext = this.getContext();
        this.mediaStreamSource = audioContext.createMediaStreamSource(this.currentStream);
        this.analyser = audioContext.createAnalyser();
        this.analyser.fftSize = 1024;
        this.meterBuffer = new Float32Array(this.analyser.fftSize);
        this.mediaStreamSource.connect(this.analyser);
    }

    stopAudioMeter () {
        if (this.mediaStreamSource) {
            try {
                this.mediaStreamSource.disconnect();
            } catch (e) {
                // already disconnected
            }
        }
        this.mediaStreamSource = null;
        this.analyser = null;
        this.meterBuffer = null;
    }

    getVolume () {
        if (!this.analyser) {
            if (this.currentStream) {
                this.startAudioMeter();
            }
            if (!this.analyser) {
                return 0;
            }
        }

        this.analyser.getFloatTimeDomainData(this.meterBuffer);

        let sum = 0;
        for (let i = 0; i < this.meterBuffer.length; i++) {
            sum += Math.abs(this.meterBuffer[i]);
        }
        const avg = Math.sqrt(sum / this.meterBuffer.length);

        // Matches the desktop build's scaling so the on-screen meter fills the
        // same way for the same loudness.
        return avg / 0.5;
    }
}
