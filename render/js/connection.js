import Signaling, { WebSocketSignaling } from "./core/signaling.js";
import * as Config from "./core/config.js";
import * as Logger from "./core/logger.js";
import uuid4 from "https://cdn.jsdelivr.net/gh/tracker1/node-uuid4/browser.mjs";
import { DataChannel } from "./data-channel.js";

//two events exposed : ondisconnect & oncandidate

export class RTCConnection {
    constructor(useWebSocket) {
        const _this = this;
        this.cfg = Config.getRTCConfiguration();
        this.pc = null;
        this.channel = null;
        this.offerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        };
        this.connectionId = null;

        this.videosList = [];
        this.videoTrackCount = 0;
        this.audioList = [];
        this.audioTrackCount = 0;

        this.setupConnection(useWebSocket);

        this.framesPerSecond = 0; //from stats
    }

    setupConnection(useWebSocket) {
        const _this = this;
        // close current RTCPeerConnection
        if (this.pc) {
            Logger.log("Close current PeerConnection");
            this.pc.close();
            this.pc = null;
        }

        if (useWebSocket) {
            this.signaling = new WebSocketSignaling();
        } else {
            this.signaling = new Signaling();
        }

        // Create peerConnection with proxy server and set up handlers
        this.pc = new RTCPeerConnection(this.cfg);

        this.stats = setInterval(function () {
            _this.pc.getStats(null).then((stats) => {
                var statsOutput = "";

                var fpsSum = 0;
                var fpsCount = 0;
                stats.forEach((report) => {
                    if (
                        report.type === "inbound-rtp" &&
                        report.kind === "video"
                    ) {
                        fpsSum += report.framesPerSecond;
                        fpsCount++;
                    }
                    /*
                    // Loops all reports
                              if (report.type === "inbound-rtp" && report.kind === "video") {
                                Object.keys(report).forEach(statName => {
                                  statsOutput += `<strong>${statName}:</strong> ${report[statName]}<br>\n`;
                                });
                                console.log(statsOutput);
                    */
                });
                _this.framesPerSecond = fpsSum / fpsCount;
            });
        }, 1000);

        this.pc.onsignalingstatechange = function (e) {
            Logger.log("signalingState changed:", e);
        };

        this.pc.oniceconnectionstatechange = function (e) {
            Logger.log("iceConnectionState changed:", e);
            Logger.log("pc.iceConnectionState:" + _this.pc.iceConnectionState);
            if (_this.pc.iceConnectionState === "disconnected") {
                _this.ondisconnect();

                //reset
                _this.videosList = [];
                _this.audioList = [];
                _this.audioTrackCount = 0;
                _this.videoTrackCount = 0;
            }
        };
        this.pc.onicegatheringstatechange = function (e) {
            Logger.log("iceGatheringState changed:", e);
        };

        this.pc.ontrack = function (e) {
            if (e.track.kind == "video") {
                _this.videosList[_this.videoTrackCount].addTrack(e.track);
                _this.videoTrackCount++;
            }

            if (e.track.kind == "audio") {
                _this.audioList[_this.audioTrackCount].addTrack(e.track);
                _this.audioTrackCount++;
            }
        };

        this.pc.onicecandidate = function (e) {
            if (e.candidate != null) {
                _this.signaling.sendCandidate(
                    _this.connectionId,
                    e.candidate.candidate,
                    e.candidate.sdpMid,
                    e.candidate.sdpMLineIndex
                );
            }
        };
        // Create data channel with proxy server and set up handlers
        let dataChannel = this.pc.createDataChannel("data");
        this.channel = new DataChannel(dataChannel);

        this.signaling.addEventListener("answer", async (e) => {
            const answer = e.detail;
            const desc = new RTCSessionDescription({
                sdp: answer.sdp,
                type: "answer"
            });
            _this.onanswer(); //on server found
            await _this.pc.setRemoteDescription(desc);
        });

        this.signaling.addEventListener("candidate", async (e) => {
            const candidate = e.detail;
            const iceCandidate = new RTCIceCandidate({
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex
            });
            await _this.pc.addIceCandidate(iceCandidate);
        });
    }

    addVideoStream(videoPlayer) {
        this.pc.addTransceiver("video", { direction: "recvonly" });
        this.videosList.push(videoPlayer);
    }

    addAudioStream(videoPlayer) {
        this.pc.addTransceiver("audio", { direction: "recvonly" });
        this.audioList.push(videoPlayer);
    }

    async startSignaling(data) {
        // setup signaling
        await this.signaling.start();
        this.connectionId = uuid4();

        // create offer
        const offer = await this.pc.createOffer(this.offerOptions);

        // set local sdp
        const desc = new RTCSessionDescription({
            sdp: offer.sdp,
            type: "offer"
        });
        await this.pc.setLocalDescription(desc);

        var sdp = offer.sdp + "x=" + JSON.stringify(data) + "\n";
        await this.signaling.sendOffer(this.connectionId, sdp);
    }

    close() {
        if (this.pc) {
            Logger.log("Close current PeerConnection");
            this.pc.close();
            clearInterval(this.stats);
            this.signaling.stop();
            this.pc = null;
            this.ondisconnect();
        }
    }

    sendMsg(msg) {
        if (this.channel == null) {
            return;
        }

        this.channel.sendMsg(msg);
    }
}

