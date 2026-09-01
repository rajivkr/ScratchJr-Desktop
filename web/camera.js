/*
 * Webcam capture for the paint editor's camera tool.
 *
 * Ported from the Electron client. The one substantive change: the old code
 * assigned `URL.createObjectURL(stream)` to video.src, which browsers removed
 * years ago -- it now sets video.srcObject, which is why the camera never
 * appeared in modern engines.
 */

class VideoCapture {

    constructor (videoElement) {
        this.videoElement = videoElement || document.createElement('video');
        this.errorHandler = null;
        this.isRecordingPermitted = true;
        this.currentStream = null;
    }

    startRecord (constraints) {
        const wanted = constraints || {video: true, audio: false};
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia(wanted).then(
                this.beginStartRecord.bind(this),
                this.onError.bind(this)
            );
        } else {
            this.onError(new Error('This browser cannot use the camera'));
        }
    }

    beginStartRecord (stream) {
        if (!this.isRecordingPermitted) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }
        this.currentStream = stream;
        this.videoElement.srcObject = stream;
        // iOS Safari refuses to play an inline video without these.
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.muted = true;
        const playPromise = this.videoElement.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {});
        }
    }

    stopRecord () {
        try {
            if (this.currentStream) {
                this.currentStream.getTracks().forEach((track) => track.stop());
            }
            this.videoElement.pause();
            this.videoElement.srcObject = null;
            this.currentStream = null;
        } catch (e) {
            console.log('Could not close the camera', e); // eslint-disable-line no-console
        }
    }

    onError (e) {
        console.log('Camera error', e); // eslint-disable-line no-console
        if (!this.inOnError) {
            try {
                this.inOnError = true;
                this.stopRecord();
            } finally {
                this.inOnError = false;
            }
        }
        if (this.errorHandler) {
            this.errorHandler(e);
        }
    }

    /** Grab the current frame as a PNG data: URL. */
    snapshot (cameraRect, isMirrored) {
        if (!this.currentStream || !this.isRecordingPermitted) {
            return null;
        }

        const canvas = document.createElement('canvas');
        const w = cameraRect.width;
        const h = cameraRect.height;

        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (isMirrored) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(this.videoElement, 0, 0, w, h);

        return canvas.toDataURL('image/png');
    }
}

export default class CameraPickerDialog {

    constructor (data) {
        this.shapeData = data;
        this.isMirrored = true;
    }

    show () {
        if (this.cameraPickerDiv) {
            return;
        }

        this.cameraPickerDiv = document.createElement('div');
        this.cameraPickerDiv.id = 'cameraPickerDiv';
        this.cameraPickerDiv.setAttribute('style', 'z-index:90000; position:absolute; top:0px; left:0px;');

        const videoStyle = this.isMirrored ? ' style="transform: scale(-1, 1);"' : '';
        this.cameraPickerDiv.innerHTML =
            '<video id="CameraPickerDialog-cameraFeed"' + videoStyle + ' autoplay playsinline muted></video>' +
            '<img id="CameraPickerDialog-maskImg" src="' + this.shapeData.image + '">';

        const backdrop = document.getElementById('backdrop') || document.body;
        backdrop.appendChild(this.cameraPickerDiv);

        this.videoElement = document.getElementById('CameraPickerDialog-cameraFeed');
        this.maskImg = document.getElementById('CameraPickerDialog-maskImg');

        // The camera rect is the small opening being filled in; the mask is a
        // workspace-sized image drawn over the rest of the drawing.
        this.layoutDiv(this.videoElement, this.shapeData.x, this.shapeData.y,
            this.shapeData.width, this.shapeData.height);
        this.layoutDiv(this.maskImg, this.shapeData.mx, this.shapeData.my,
            this.shapeData.mw, this.shapeData.mh);

        this.videoCaptureElement = new VideoCapture(this.videoElement);
        this.videoCaptureElement.isRecordingPermitted = true;
        this.videoCaptureElement.startRecord({
            video: {width: this.shapeData.width, height: this.shapeData.height}
        });
    }

    layoutDiv (el, x, y, w, h) {
        try {
            el.style.position = 'absolute';
            el.style.top = y + 'px';
            el.style.left = x + 'px';
            if (w) {
                el.style.width = w + 'px';
            }
            if (h) {
                el.style.height = h + 'px';
            }
        } catch (e) {
            console.log('Cannot lay out camera element', e); // eslint-disable-line no-console
        }
    }

    snapshot () {
        if (!this.videoCaptureElement) {
            return null;
        }
        const cameraRect = {
            x: 0,
            y: 0,
            width: this.shapeData.width,
            height: this.shapeData.height
        };
        return this.videoCaptureElement.snapshot(cameraRect, this.isMirrored);
    }

    hide () {
        if (this.videoCaptureElement) {
            this.videoCaptureElement.stopRecord();
            this.videoCaptureElement = null;
        }
        if (this.cameraPickerDiv) {
            this.cameraPickerDiv.remove();
            this.cameraPickerDiv = null;
        }
        this.videoElement = null;
    }
}
