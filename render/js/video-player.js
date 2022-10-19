import * as Config from "./core/config.js";
import * as Logger from "./core/logger.js";
import uuid4 from "https://cdn.jsdelivr.net/gh/tracker1/node-uuid4/browser.mjs";

export class VideoPlayer {
    constructor(element) {
        const _this = this;

        this.localStream = new MediaStream();
        this.video = element;
        this.video.playsInline = true;
        this.video.addEventListener(
            "loadedmetadata",
            function () {
                _this.video.play();
                _this.resizeVideo(_this.video);
            },
            true
        );

        this.ondisconnect = function () {};
    }

    resizeVideo() {
        const clientRect = this.video.getBoundingClientRect();
        const videoRatio = this.video.videoWidth / this.video.videoHeight;
        const clientRatio = clientRect.width / clientRect.height;

        this._videoScale =
            videoRatio > clientRatio
                ? clientRect.width / this.video.videoWidth
                : clientRect.height / this.video.videoHeight;
        const videoOffsetX =
            videoRatio > clientRatio
                ? 0
                : (clientRect.width -
                      this.video.videoWidth * this._videoScale) *
                  0.5;
        const videoOffsetY =
            videoRatio > clientRatio
                ? (clientRect.height -
                      this.video.videoHeight * this._videoScale) *
                  0.5
                : 0;
        this._videoOriginX = clientRect.left + videoOffsetX;
        this._videoOriginY = clientRect.top + videoOffsetY;
    }

    addTrack(track) {
        this.localStream.addTrack(track);
        this.video.srcObject = this.localStream;
    }

    // replace video track related the MediaStream
    replaceTrack(stream, newTrack) {
        const tracks = stream.getVideoTracks();
        for (const track of tracks) {
            if (track.kind == "video") {
                stream.removeTrack(track);
            }
        }
        stream.addTrack(newTrack);
    }

    get videoWidth() {
        return this.video.videoWidth;
    }

    get videoHeight() {
        return this.video.videoHeight;
    }

    get videoOriginX() {
        return this._videoOriginX;
    }

    get videoOriginY() {
        return this._videoOriginY;
    }

    get videoScale() {
        return this._videoScale;
    }
}

