import {RTCConnection} from "./connection.js";
import {VideoPlayer} from "./video-player.js";
import {
    InputEvent,
    registerKeyboardEvents,
    registerMouseEvents
} from "./core/register-events.js";
import {getServerConfig} from "./core/config.js";
import {HandData} from "./handdata.js";

const VRDataType = {
    PosRot: 0,
    Button: 1,
    Axis: 2,
    Display: 3,
    EnterVR: 4,
    ExitVR: 5,
    HandTrackingPosRot: 6,
    HandTrackingBoolEvent: 7
};

const VRBoolEvent = {
    Grip: 0,
    Pinch: 1
};

setup();

let playButton, vrButton, forceDCButton;
let videoConnection;
let audioConnection;
let videoPlayers = [];
let useWebSocket;
let lReady = false;
let rReady = false;

let lVideo, rVideo;

window.document.oncontextmenu = function () {
    return false; // cancel default menu
};

window.addEventListener(
    "resize",
    function () {
        for (let i = 0; i < videoPlayers.length; i++) {
            videoPlayers[i].resizeVideo();
        }
    },
    true
);

window.addEventListener(
    "scroll",
    function () {
        for (let i = 0; i < videoPlayers.length; i++) {
            videoPlayers[i].resizeVideo();
        }
    },
    true
);

window.getFramesPerSecond = function getFramesPerSecond() {
    if (videoConnection) {
        return videoConnection.framesPerSecond;
    } else {
        return 0;
    }
};

async function setup() {
    const res = await getServerConfig();
    useWebSocket = res.useWebSocket;
    showPlayButton(true);
    audioConnection = setupAudioConnection();
    if (audioConnection) {
        console.log("audioConnection socketURL: " + audioConnection.socketURL);
    }
}

//called from setup
function showPlayButton(showConnect = true) {
    playButton = document.getElementById("playButton"); //playButton is global
    vrButton = document.getElementById("enterVRButton"); //vrButton is global
    forceDCButton = document.getElementById("forceDC"); //forceButton is global
    if (!playButton) {
        playButton = document.createElement("img");
        playButton.id = "playButton";
        playButton.src = "images/Play.png";
        playButton.alt = "Start Streaming";
        document.getElementById("player").appendChild(playButton);
    }

    forceDCButton.style.display = showConnect ? "none" : "";
    vrButton.style.display = showConnect ? "none" : ""; // hide vr button till connection
    playButton.style.display = showConnect ? "" : "none"; //show button now
    playButton.addEventListener("click", onClickPlayButton);
    forceDCButton.addEventListener("click", forceDisconnect);
}

function onClickPlayButton() {
    const playerDiv = document.getElementById("player");

    //Setup Video Players
    if (document.getElementById("lefteye") === null) {
        lVideo = document.createElement("video");
        lVideo.id = "lefteye";
        lVideo.style.touchAction = "none";
        playerDiv.appendChild(lVideo);
    }

    if (document.getElementById("righteye") === null) {
        rVideo = document.createElement("video");
        rVideo.id = "righteye";
        rVideo.style.touchAction = "none";
        rVideo.style.display = "none";
        playerDiv.appendChild(rVideo);
    }

    createAFrameVR(playerDiv);

    //setupVideoPlayer([lVideo]).then(value => connection = value); //for single stream
    setupVideoPlayer([lVideo, rVideo]).then((value) => (videoConnection = value));
    if (audioConnection) {
        let roomID = document.getElementById("roomID").value;
        audioConnection.token = roomID;
        audioConnection.openOrJoin(roomID);
    }
}

async function setupVideoPlayer(elements) {
    if (videoConnection) {
        //if current connection, then close it
        videoPlayers = [];
        videoConnection.close();
    }

    let newConnection = new RTCConnection(useWebSocket);

    for (let i = 0; i < elements.length; i++) {
        let videoPlayer = new VideoPlayer(elements[i]);
        newConnection.addVideoStream(videoPlayer);

        videoPlayers.push(videoPlayer);
    }

    newConnection.addAudioStream(videoPlayers[0]); //add audio stream to just first video

    await newConnection.startSignaling({
        user: document.getElementById("gameID").value
    });
    newConnection.ondisconnect = onDisconnect;
    newConnection.onanswer = onAnswer;

    registerKeyboardEvents(newConnection, videoPlayers[0]);
    registerMouseEvents(newConnection, videoPlayers[0], elements[0]);

    return newConnection;
}

function setupAudioConnection() {
    if (audioConnection) {
        console.log("audioConnection already established.");
        return;
    }
    let newConnection = new RTCMultiConnection();
    newConnection.socketURL = "/";
    newConnection.socketMessageEvent = "VRMeeting";
    newConnection.session = {
        audio: true,
        video: false
    };
    newConnection.mediaConstraints = {
        audio: true,
        video: false
    };
    newConnection.sdpConstraints.mandatory = {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: false
    };
    newConnection.iceServers = [{
        "urls": [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
            "stun:stun.l.google.com:19302?transport=udp",
        ]
    }];

    newConnection.audiosContainer = document.getElementById("audios-container");
    newConnection.onstream = function () {
        let number = parseInt(document.getElementById("participant-number").innerText);
        number += 1;
        document.getElementById("participant-number").innerText = number.toString();
    };

    newConnection.onstreamended = function () {
        let number = parseInt(document.getElementById("participant-number").innerText);
        number -= 1;
        document.getElementById("participant-number").innerText = number.toString();
    };

    return newConnection;
}

function onAnswer() {
    showPlayButton(false);
}

function forceDisconnect() {
    videoConnection.close();
}

function onDisconnect() {
    const playerDiv = document.getElementById("player");
    //to avoid vrButton deletion because it is deleted by the scene
    let vrScene = document.getElementById("a-frame-id");
    vrScene.style.display = "none";

    for (let i = 0; i < videoPlayers.length; i++) {
        videoPlayers[i].video.remove();
    }

    //clearChildren(vrscene);
    videoPlayers = [];
    videoConnection = null;
    // audioConnection = null;
    showPlayButton(true);
}

function ThumbstickMoved(button, handId) {
    console.log(button);
    let data = new DataView(new ArrayBuffer(19));
    data.setUint8(0, InputEvent.VR); //for GamePad ID
    data.setUint8(1, VRDataType.Axis); //for controller axis button data
    data.setUint8(2, handId); //head = 0, left = 1, right = 2

    data.setFloat32(3, button.detail.x, true);
    data.setFloat32(11, button.detail.y, true);

    if (videoConnection) {
        videoConnection.sendMsg(data.buffer);
    }
}

function AxisChanged(button, hand) {
    let data = new DataView(new ArrayBuffer(39));
    data.setUint8(0, InputEvent.VR); //for GamePad ID
    data.setUint8(1, VRDataType.Axis); //for controller axis button data
    data.setUint8(2, hand + 1); //head = 0, left = 1, right = 2
    console.log(button);

    data.setUint8(3, button.detail.changed[0]); // trackpad left-right changed
    data.setFloat32(4, button.detail.axis[0], true); // trackpad left-right value

    data.setUint8(12, button.detail.changed[1]); // trackpad up-down changed
    data.setFloat32(13, button.detail.axis[1], true); // trackpad up-down value

    data.setUint8(21, button.detail.changed[2]); // joystick left-right changed
    data.setFloat32(22, button.detail.axis[2], true); // joystick left-right value

    data.setUint8(30, button.detail.changed[3]); // joystick up-down changed
    data.setFloat32(31, button.detail.axis[3], true); // joystick up-down value

    if (videoConnection) {
        videoConnection.sendMsg(data.buffer);
    }
}

function ButtonChanged(button, hand) {
    console.log(button);
    let data = new DataView(new ArrayBuffer(6));
    data.setUint8(0, InputEvent.VR); //for GamePad ID
    data.setUint8(1, VRDataType.Button); //for controller button data
    data.setUint8(2, hand + 1); //head = 0, left = 1, right = 2

    if (button.type === "gripdown") {
        data.setUint8(3, 1);
        data.setUint8(4, true);
        data.setUint8(5, true);
    } else if (button.type === "gripup") {
        data.setUint8(3, 1);
        data.setUint8(4, false);
        data.setUint8(5, true);
    } else if (button.type === "griptouchend") {
        data.setUint8(3, 1);
        data.setUint8(4, false);
        data.setUint8(5, false);
    }

    // data.setUint8(3, button.detail.id);
    // data.setUint8(4, button.detail.state.pressed);
    // data.setUint8(5, button.detail.state.touched);
    if (videoConnection) {
        videoConnection.sendMsg(data.buffer);
    }
}

function Trigger(button, hand) {
    console.log(button);
    let data = new DataView(new ArrayBuffer(6));
    data.setUint8(0, InputEvent.VR); //for GamePad ID
    data.setUint8(1, VRDataType.Button); //for controller button data
    data.setUint8(2, hand + 1); //head = 0, left = 1, right = 2

    if (button.type === "triggerdown") {
        data.setUint8(3, 0);
        data.setUint8(4, true);
        data.setUint8(5, true);
    } else if (button.type === "triggerup") {
        data.setUint8(3, 0);
        data.setUint8(4, false);
        data.setUint8(5, true);
    } else if (button.type === "triggertouchend") {
        data.setUint8(3, 0);
        data.setUint8(4, false);
        data.setUint8(5, false);
    }

    if (videoConnection) {
        videoConnection.sendMsg(data.buffer);
    }
}

function setupHandControl(vrScene) {
    //Setup Controllers
    const leftCtrl = document.createElement("a-entity");
    leftCtrl.id = "leftCtrl";
    leftCtrl.setAttribute("oculus-touch-controls", "hand", "left");
    leftCtrl.setAttribute("update", "index", "1");
    vrScene.appendChild(leftCtrl);

    const rightCtrl = document.createElement("a-entity");
    rightCtrl.id = "rightCtrl";
    rightCtrl.setAttribute("oculus-touch-controls", "hand", "right");
    rightCtrl.setAttribute("update", "index", "2");
    vrScene.appendChild(rightCtrl);

    //Controller Events

    leftCtrl.addEventListener("gripdown", function (button) {
        ButtonChanged(button, 0); //left hand  = 0
    });
    leftCtrl.addEventListener("gripup", function (button) {
        ButtonChanged(button, 0); //left hand  = 0
    });
    leftCtrl.addEventListener("griptouchend", function (button) {
        ButtonChanged(button, 0);
    });
    leftCtrl.addEventListener("triggerdown", function (button) {
        Trigger(button, 0);
    });
    leftCtrl.addEventListener("triggerup", function (button) {
        Trigger(button, 0);
    });
    leftCtrl.addEventListener("triggertouchend", function (button) {
        Trigger(button, 0);
    });

    rightCtrl.addEventListener("gripdown", function (button) {
        ButtonChanged(button, 1); // right hand = 1
    });
    rightCtrl.addEventListener("gripup", function (button) {
        ButtonChanged(button, 1); // right hand = 1
    });
    rightCtrl.addEventListener("griptouchend", function (button) {
        ButtonChanged(button, 1);
    });
    rightCtrl.addEventListener("triggerdown", function (button) {
        Trigger(button, 1);
    });
    rightCtrl.addEventListener("triggerup", function (button) {
        Trigger(button, 1);
    });
    rightCtrl.addEventListener("triggertouchend", function (button) {
        Trigger(button, 1);
    });

    leftCtrl.addEventListener("thumbstickmoved", function (button) {
        ThumbstickMoved(button, 1);
    });
    rightCtrl.addEventListener("thumbstickmoved", function (button) {
        ThumbstickMoved(button, 2);
    });
}

function pinchMoved(evt, handId, isEnd) {
    // console.log(evt);
    let data = new DataView(new ArrayBuffer(19));
    data.setUint8(0, InputEvent.VR); //for GamePad ID
    data.setUint8(1, VRDataType.Axis); //for controller axis button data
    data.setUint8(2, handId); //head = 0, left = 1, right = 2

    if (isEnd) {
        data.setFloat32(3, 0, true);
        data.setFloat32(11, 0, true);
    } else {
        data.setFloat32(3, evt.detail.data.x, true);
        data.setFloat32(11, evt.detail.data.y, true);
    }

    if (videoConnection) {
        videoConnection.sendMsg(data.buffer);
    }
}

function setupHandTracking(vrScene) {
    //Setup Hands
    const leftHand = document.createElement("a-entity");
    leftHand.id = "leftHand";
    leftHand.setAttribute("hand-tracking-controls", "hand", "left");
    leftHand.setAttribute("hand-tracking-extras", "");
    leftHand.setAttribute("synchand", "index", "1");
    // leftHand.setAttribute("visible", false);
    vrScene.appendChild(leftHand);

    leftHand.addEventListener("hand-tracking-extras-ready", () => {
        lReady = true;
        console.log("lReady == true");
    });
    leftHand.addEventListener("gripstarted", (evt) => {
        console.log(evt);
        sendGrip(1, true);
    });
    leftHand.addEventListener("gripended", (evt) => {
        console.log(evt);
        sendGrip(1, false);
    });
    leftHand.addEventListener("mypinchmoved", (evt) => {
        pinchMoved(evt, 1, false);
    });
    leftHand.addEventListener("mypinchended", (evt) => {
        pinchMoved(evt, 1, true);
    });

    const rightHand = document.createElement("a-entity");
    rightHand.id = "rightHand";
    rightHand.setAttribute("hand-tracking-controls", "hand", "right");
    rightHand.setAttribute("hand-tracking-extras", "");
    rightHand.setAttribute("synchand", "index", "2");
    // rightHand.setAttribute("visible", false);
    vrScene.appendChild(rightHand);

    rightHand.addEventListener("hand-tracking-extras-ready", () => {
        rReady = true;
        console.log("rReady == true");
    });
    rightHand.addEventListener("gripstarted", (evt) => {
        console.log(evt);
        sendGrip(2, true);
    });
    rightHand.addEventListener("gripended", (evt) => {
        console.log(evt);
        sendGrip(2, false);
    });
    rightHand.addEventListener("mypinchmoved", (evt) => {
        pinchMoved(evt, 2, false);
    });
    rightHand.addEventListener("mypinchended", (evt) => {
        pinchMoved(evt, 2, true);
    });
}

function sendGrip(handId, isFist) {
    let data = new DataView(new ArrayBuffer(59));
    data.setUint8(0, InputEvent.VR);
    data.setUint8(1, VRDataType.HandTrackingBoolEvent);
    data.setUint8(2, handId);
    data.setUint8(3, VRBoolEvent.Grip);
    data.setUint8(4, isFist);

    if (videoConnection) {
        videoConnection.sendMsg(data.buffer);
    }
}

function setupVRVideo(myCam) {
    //Setup VR Videos
    //myCam.innerHTML = '<a-video id="LeftVR" material="src: #lefteye; offset: 0 0; repeat: 0.5 1"></a-video>' +
    //                '<a-video id="RightVR"></a-video>';
    //const leftVRVideo = document.getElementById('LeftVR');
    const leftVRVideo = document.createElement("a-video");
    leftVRVideo.id = "LeftVR";
    //leftVRVideo.className = "vrvideo";
    leftVRVideo.setAttribute("width", "1.125");
    leftVRVideo.setAttribute("height", "1.25");

    leftVRVideo.setAttribute("layers", "1"); //Left Eye Layer
    leftVRVideo.setAttribute("position", "-0.032 0 -0.5");

    //this is not working use material
    //leftVRVideo.setAttribute("matsetup" , "xOffset" , "0.0");
    //leftVRVideo.setAttribute("matsetup" , "xRepeat" , "0.5");
    leftVRVideo.setAttribute("matsetup", "vidSrc", "lefteye");

    //leftVRVideo.setAttribute("material" , "src", "#lefteye");
    //leftVRVideo.setAttribute("material" , "offset" , "0 0");
    //leftVRVideo.setAttribute("material" , "repeat" , "0.5 1");
    myCam.appendChild(leftVRVideo);

    //const rightVRVideo = document.getElementById('RightVR');
    const rightVRVideo = document.createElement("a-video");
    rightVRVideo.id = "RightVR";
    //rightVRVideo.className = "vrvideo";
    rightVRVideo.setAttribute("width", "1.125");
    rightVRVideo.setAttribute("height", "1.25");
    //rightVRVideo.setAttribute("material" , "src", "#lefteye");
    rightVRVideo.setAttribute("layers", "2"); //Right Eye Layer
    rightVRVideo.setAttribute("position", "0.032 0 -0.5");

    //rightVRVideo.setAttribute("matsetup" , "xOffset", "0.5");
    //rightVRVideo.setAttribute("matsetup" , "xRepeat", "0.5");
    rightVRVideo.setAttribute("matsetup", "vidSrc", "righteye");

    //this is not working - use matsetup
    //rightVRVideo.setAttribute("material" , "offset" , "0.5 0");
    //rightVRVideo.setAttribute("material" , "repeat" , "0.5 1");
    myCam.appendChild(rightVRVideo);
}

function createAFrameVR(parentDiv) {
    let frame = document.getElementById("a-frame-id");
    if (frame) {
        frame.style.display = "";
        return;
    }

    let aframeDiv = document.createElement("div");
    aframeDiv.id = "a-frame-id";
    parentDiv.appendChild(aframeDiv);

    //Setup A-Frame Scene
    const vrScene = document.createElement("a-scene");
    let vrUI = {enabled: true}; //default

    if (vrButton) {
        vrUI.enterVRButton = "#enterVRButton";
    }
    vrScene.setAttribute("vr-mode-ui", vrUI);
    vrScene.setAttribute("embedded", "");

    vrScene.addEventListener("enter-vr", function () {
        lVideo.style.display = "none";
        setTimeout(function () {
            let data = new DataView(new ArrayBuffer(2));
            data.setUint8(0, InputEvent.VR); //for VR ID
            data.setUint8(1, VRDataType.EnterVR); //for Enter VR

            if (videoConnection) {
                videoConnection.sendMsg(data.buffer);
            }

            data = new DataView(new ArrayBuffer(10));
            data.setUint8(0, InputEvent.VR); //for VR ID
            data.setUint8(1, VRDataType.Display); //for Display data
            data.setUint32(
                2,
                vrScene.xrSession.renderState.baseLayer.framebufferWidth,
                true
            ); //set Width
            data.setUint32(
                6,
                vrScene.xrSession.renderState.baseLayer.framebufferHeight,
                true
            ); //set Height

            if (videoConnection) {
                videoConnection.sendMsg(data.buffer);
            }
        }, 500); //wait half a second before sending data so that buffer gets instantiated
    });

    vrScene.addEventListener("exit-vr", function () {
        lVideo.style.display = "";

        let data = new DataView(new ArrayBuffer(2));
        data.setUint8(0, InputEvent.VR); //for VR ID
        data.setUint8(1, VRDataType.ExitVR); //for Enter VR

        if (videoConnection) {
            videoConnection.sendMsg(data.buffer);
        }
    });

    aframeDiv.appendChild(vrScene);

    //Setup Camera
    const myCam = document.createElement("a-camera");
    myCam.id = "camera";
    myCam.setAttribute("wasd-controls", "enabled", "false");
    myCam.setAttribute("look-controls", "mouseEnabled", "false");
    myCam.setAttribute("look-controls", "touchEnabled", "false");
    myCam.setAttribute("look-controls", "magicWindowTrackingEnabled", "false");
    myCam.setAttribute("update", "index", "0");
    vrScene.appendChild(myCam);

    setupHandControl(vrScene);
    setupHandTracking(vrScene);
    setupVRVideo(myCam);
}

function sleep(msec) {
    return new Promise((resolve) => setTimeout(resolve, msec));
}

function minus(vector1, vector2) {
    let x = vector1.x - vector2.x;
    let y = vector1.y - vector2.y;
    let z = vector1.z - vector2.z;
    let pos = {x: x, y: y, z: z};
    if (!checkPos(pos)) {
        return pos;
    }
}

function getHandUnitPosRot(handId) {
    let arr = [];
    let disArr = [];
    let jointAPI = document
        .getElementById(handId)
        .components["hand-tracking-extras"].getJoints();

    let wristPos = jointAPI.getWrist().getWristPosition();
    let wristRot = jointAPI.getWrist().getWristQuaternion();

    // Thumb
    let thumbArr = [];
    let thumbMetacarpalPos = jointAPI.getThumbMetacarpal().getPosition();
    let thumbMetacarpalRot = jointAPI.getThumbMetacarpal().getQuaternion();
    thumbArr[0] = [thumbMetacarpalPos, thumbMetacarpalRot];

    let thumbProximalPos = jointAPI.getThumbProximal().getPosition();
    let thumbProximalRot = jointAPI.getThumbProximal().getQuaternion();
    thumbArr[1] = [thumbProximalPos, thumbProximalRot];

    let thumbDistalPos = jointAPI.getThumbDistal().getPosition();
    let thumbDistalRot = jointAPI.getThumbDistal().getQuaternion();
    thumbArr[2] = [thumbDistalPos, thumbDistalRot];

    let thumbTipPos = jointAPI.getThumbTip().getPosition();
    let thumbTipRot = jointAPI.getThumbTip().getQuaternion();
    thumbArr[3] = [thumbTipPos, thumbTipRot];

    arr[0] = thumbArr;
    //    let thumbDisArr = [];
    //    let thumbMetDis = minus(thumbMetacarpalPos, wristPos);
    //    let thumbProDis = minus(thumbProximalPos, wristPos);
    //    let thumbDisDis = minus(thumbDistalPos, wristPos);
    //    let thumbTipDis = minus(thumbTipPos, wristPos);
    //    thumbDisArr.push(thumbMetDis, thumbProDis, thumbDisDis, thumbTipDis);
    //    disArr.push(thumbDisArr);
    //

    // Index
    let indexArr = [];
    let indexMetacarpalPos = jointAPI.getIndexMetacarpal().getPosition();
    let indexMetacarpalRot = jointAPI.getIndexMetacarpal().getQuaternion();
    indexArr[0] = [indexMetacarpalPos, indexMetacarpalRot];

    let indexProximalPos = jointAPI.getIndexProximal().getPosition();
    let indexProximalRot = jointAPI.getIndexProximal().getQuaternion();
    indexArr[1] = [indexProximalPos, indexProximalRot];

    let indexIntermediatePos = jointAPI.getIndexIntermediate().getPosition();
    let indexIntermediateRot = jointAPI.getIndexIntermediate().getQuaternion();
    indexArr[2] = [indexIntermediatePos, indexIntermediateRot];

    let indexDistalPos = jointAPI.getIndexDistal().getPosition();
    let indexDistalRot = jointAPI.getIndexDistal().getQuaternion();
    indexArr[3] = [indexDistalPos, indexDistalRot];

    let indexTipPos = jointAPI.getIndexTip().getPosition();
    let indexTipRot = jointAPI.getIndexTip().getQuaternion();
    indexArr[4] = [indexTipPos, indexTipRot];

    arr[1] = indexArr;
    //    let indexDisArr = []
    //    let indexProDis = minus(indexProximalPos, wristPos);
    //    let indexIntDis = minus(indexIntermediatePos, wristPos);
    //    let indexDisDis = minus(indexDistalPos, wristPos);
    //    let indexTipDis = minus(indexTipPos, wristPos);
    //    indexDisArr.push(indexProDis, indexIntDis, indexDisDis, indexTipDis);
    //    disArr.push(indexDisArr);

    // Middle
    let middleArr = [];
    let middleMetacarpalPos = jointAPI.getMiddleMetacarpal().getPosition();
    let middleMetacarpalRot = jointAPI.getMiddleMetacarpal().getQuaternion();
    middleArr[0] = [middleMetacarpalPos, middleMetacarpalRot];

    let middleProximalPos = jointAPI.getMiddleProximal().getPosition();
    let middleProximalRot = jointAPI.getMiddleProximal().getQuaternion();
    middleArr[1] = [middleProximalPos, middleProximalRot];

    let middleIntermediatePos = jointAPI.getMiddleIntermediate().getPosition();
    let middleIntermediateRot = jointAPI
        .getMiddleIntermediate()
        .getQuaternion();
    middleArr[2] = [middleIntermediatePos, middleIntermediateRot];

    let middleDistalPos = jointAPI.getMiddleDistal().getPosition();
    let middleDistalRot = jointAPI.getMiddleDistal().getQuaternion();
    middleArr[3] = [middleDistalPos, middleDistalRot];

    let middleTipPos = jointAPI.getMiddleTip().getPosition();
    let middleTipRot = jointAPI.getMiddleTip().getQuaternion();
    middleArr[4] = [middleTipPos, middleTipRot];

    arr[2] = middleArr;
    //    let middleDisArr = [];
    //    let middleProDis = minus(middleProximalPos, wristPos);
    //    let middleIntDis = minus(middleIntermediatePos, wristPos);
    //    let middleDisDis = minus(middleDistalPos, wristPos);
    //    let middleTipDis = minus(middleTipPos, wristPos);
    //    middleDisArr.push(middleProDis, middleIntDis, middleDisDis, middleTipDis);
    //    disArr.push(middleDisArr);

    // Ring
    let ringArr = [];
    let ringMetacarpalPos = jointAPI.getRingMetacarpal().getPosition();
    let ringMetacarpalRot = jointAPI.getRingMetacarpal().getQuaternion();
    ringArr[0] = [ringMetacarpalPos, ringMetacarpalRot];

    let ringProximalPos = jointAPI.getRingProximal().getPosition();
    let ringProximalRot = jointAPI.getRingProximal().getQuaternion();
    ringArr[1] = [ringProximalPos, ringProximalRot];

    let ringIntermediatePos = jointAPI.getRingIntermediate().getPosition();
    let ringIntermediateRot = jointAPI.getRingIntermediate().getQuaternion();
    ringArr[2] = [ringIntermediatePos, ringIntermediateRot];

    let ringDistalPos = jointAPI.getRingDistal().getPosition();
    let ringDistalRot = jointAPI.getRingDistal().getQuaternion();
    ringArr[3] = [ringDistalPos, ringDistalRot];

    let ringTipPos = jointAPI.getRingTip().getPosition();
    let ringTipRot = jointAPI.getRingTip().getQuaternion();
    ringArr[4] = [ringTipPos, ringTipRot];

    arr[3] = ringArr;

    //    let ringDisArr = [];
    //    let ringProDis = minus(ringProximalPos, wristPos);
    //    let ringIntDis = minus(ringIntermediatePos, wristPos);
    //    let ringDisDis = minus(ringDistalPos, wristPos);
    //    let ringTipDis = minus(ringTipPos, wristPos);
    //    ringDisArr.push(ringProDis, ringIntDis, ringDisDis, ringTipDis);
    //    disArr.push(ringDisArr);

    // Little
    let littleArr = [];
    let littleMetacarpalPos = jointAPI.getLittleMetacarpal().getPosition();
    let littleMetacarpalRot = jointAPI.getLittleMetacarpal().getQuaternion();
    littleArr[0] = [littleMetacarpalPos, littleMetacarpalRot];

    let littleProximalPos = jointAPI.getLittleProximal().getPosition();
    let littleProximalRot = jointAPI.getLittleProximal().getQuaternion();
    littleArr[1] = [littleProximalPos, littleProximalRot];

    let littleIntermediatePos = jointAPI.getLittleIntermediate().getPosition();
    let littleIntermediateRot = jointAPI
        .getLittleIntermediate()
        .getQuaternion();
    littleArr[2] = [littleIntermediatePos, littleIntermediateRot];

    let littleDistalPos = jointAPI.getLittleDistal().getPosition();
    let littleDistalRot = jointAPI.getLittleDistal().getQuaternion();
    littleArr[3] = [littleDistalPos, littleDistalRot];

    let littleTipPos = jointAPI.getLittleTip().getPosition();
    let littleTipRot = jointAPI.getLittleTip().getQuaternion();
    littleArr[4] = [littleTipPos, littleTipRot];

    //    let littleDisArr = [];
    //    let littleProDis = minus(littleProximalPos, wristPos);
    //    let littleIntDis = minus(littleIntermediatePos, wristPos);
    //    let littleDisDis = minus(littleDistalPos, wristPos);
    //    let littleTipDis = minus(littleTipPos, wristPos);
    //    littleDisArr.push(littleProDis, littleIntDis, littleDisDis, littleTipDis);
    //    disArr.push(littleDisArr);
    //
    //    console.log(disArr);

    arr[4] = littleArr;

    return arr;
}

function isInvalid(num) {
    return !(num && !Number.isNaN(num));
}

function checkPos(pos) {
    return isInvalid(pos.x) || isInvalid(pos.y) || isInvalid(pos.z);
}

function checkRot(rot) {
    return (
        isInvalid(rot.x) ||
        isInvalid(rot.y) ||
        isInvalid(rot.z) ||
        isInvalid(rot.w)
    );
}

function checkTrans(pos, rot) {
    return checkPos(pos) || checkRot(rot);
}

function sendData(index, i, j, pos, rot) {
    if (checkTrans(pos, rot)) {
        return;
    }
    let fingerName = "";
    let jointName = "";
    if (i === 0) {
        fingerName = "thumb";
        if (j === 0) {
            jointName = "metacarpal";
        } else if (j === 1) {
            jointName = "proximal";
        } else if (j === 2) {
            jointName = "distal";
        } else if (j === 3) {
            jointName = "tip";
        }
    } else if (i === 1) {
        fingerName = "index";
    } else if (i === 2) {
        fingerName = "middle";
    } else if (i === 3) {
        fingerName = "ring";
    } else if (i === 4) {
        fingerName = "little";
    }

    if (i !== 0) {
        if (j === 0) {
            jointName = "metacarpal";
        } else if (j === 1) {
            jointName = "proximal";
        } else if (j === 2) {
            jointName = "intermediate";
        } else if (j === 3) {
            jointName = "distal";
        } else if (j === 4) {
            jointName = "tip";
        }
    }
    // console.log(
    //     fingerName + " " +
    //     jointName + " " +
    //     "Position: (" + pos.x + ", " + pos.y + ", " + pos.z + ")");
    //      " Rotation: (" + rot.x + ", " + rot.y + ", " + rot.z + ", " + rot.w + ")");

    let data = new DataView(new ArrayBuffer(60));
    data.setUint8(0, InputEvent.VR);
    data.setUint8(1, VRDataType.HandTrackingPosRot);
    data.setUint8(2, index);
    if (i === 0) {
        // thumb have 4 joints.
        data.setUint8(3, i + j);
    } else {
        // others have 4 joints.
        data.setUint8(3, 3 + (i - 1) * 4 + j);
    }
    data.setFloat32(4, pos.x, true);
    data.setFloat32(12, pos.y, true);
    data.setFloat32(20, pos.z, true);

    data.setFloat32(28, rot.x, true);
    data.setFloat32(36, rot.y, true);
    data.setFloat32(44, rot.z, true);
    data.setFloat32(52, rot.w, true);

    if (videoConnection) {
        videoConnection.sendMsg(data.buffer);
    }
}

function getHandId(index) {
    let handId = "";
    if (index === 1) {
        handId = "leftHand";
    } else if (index === 2) {
        handId = "rightHand";
    } else {
        console.error("index error");
    }
    return handId;
}

function sendAllData(index) {
    let handId = getHandId(index);
    if (handId === "") {
        return;
    }
    let arr = getHandUnitPosRot(handId);

    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr[i].length; j++) {
            if (i !== 0 && j === 0) {
                continue;
            } else {
                let posRotArr = arr[i][j];
                if (posRotArr.length === 2) {
                    sendData(index, i, j, posRotArr[0], posRotArr[1]);
                } else {
                    sendData(index, i, j, posRotArr[0]);
                }
            }
        }
    }
}

function sendWrist(index) {
    let handId = getHandId(index);
    if (handId === "") {
        return;
    }

    let jointAPI = document
        .getElementById(handId)
        .components["hand-tracking-extras"].getJoints();

    let pos = jointAPI.getWrist().getWristPosition();
    let rot = jointAPI.getWrist().getWristQuaternion();

    if (checkTrans(pos, rot)) {
        return;
    }

    // console.log(
    //     handId + " wrist " +
    //     "Position: (" + pos.x + ", " + pos.y + ", " + pos.z + ")" +
    //     " Rotation: (" + rot.x + ", " + rot.y + ", " + rot.z + ", " + rot.w + ")");

    let data = new DataView(new ArrayBuffer(60));
    data.setUint8(0, InputEvent.VR);
    data.setUint8(1, VRDataType.HandTrackingPosRot);
    data.setUint8(2, index);
    data.setUint8(3, 20);
    data.setFloat32(4, pos.x, true);
    data.setFloat32(12, pos.y, true);
    data.setFloat32(20, pos.z, true);

    data.setFloat32(28, rot.x, true);
    data.setFloat32(36, rot.y, true);
    data.setFloat32(44, rot.z, true);
    data.setFloat32(52, rot.w, true);

    if (videoConnection) {
        videoConnection.sendMsg(data.buffer);
    }
}

AFRAME.registerComponent("update", {
    schema: {
        index: {type: "number", default: 0}
    },

    tick: function (time, timeDelta) {
        let data = new DataView(new ArrayBuffer(59));
        data.setUint8(0, InputEvent.VR);
        data.setUint8(1, VRDataType.PosRot); //for positional / rotational data
        data.setUint8(2, this.data.index); //head = 0, left = 1, right = 2
        data.setFloat32(3, this.el.object3D.position.x, true);
        data.setFloat32(11, this.el.object3D.position.y, true);
        data.setFloat32(19, this.el.object3D.position.z, true);

        data.setFloat32(27, this.el.object3D.quaternion.x, true);
        data.setFloat32(35, this.el.object3D.quaternion.y, true);
        data.setFloat32(43, this.el.object3D.quaternion.z, true);
        data.setFloat32(51, this.el.object3D.quaternion.w, true);

        if (videoConnection) {
            videoConnection.sendMsg(data.buffer);
        }
    }
});

AFRAME.registerComponent("synchand", {
    schema: {
        index: {type: "number", default: 0}
    },
    tick: function (time, timeDelta) {
        if (lReady && this.data.index === 1) {
            sendWrist(1);
            sendAllData(1);
        }
        if (rReady && this.data.index === 2) {
            sendWrist(2);
            sendAllData(2);
        }
    }
});

AFRAME.registerComponent("matsetup", {
    schema: {
        vidSrc: {type: "string", default: "lefteye"},
        xOffset: {type: "number", default: 0},
        xRepeat: {type: "number", default: 1}
    },

    /**
     * Initial creation and setting of the mesh.
     */
    init: function () {
        let obj = this.el.getObject3D("mesh");

        const texture = new THREE.VideoTexture(
            document.getElementById(this.data.vidSrc)
        );
        // without wrapping, it will just "stretch" instead of "repeating"
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.offset.set(this.data.xOffset, 0);
        texture.repeat.set(this.data.xRepeat, 1);
        // assign the new texture
        obj.material.map = texture;
        // update the material
        obj.material.needsUpdate = true;
    }
});

AFRAME.registerComponent("hand-tracking-extras", {
    init: function () {
        this.el.addEventListener("enter-vr", this.play);
        this.el.addEventListener("exit-vr", this.pause);
        this.el.isPinch = false;
        this.el.isGrip = false;
        this.el.pinchStartPos = new THREE.Vector3();
    },
    tick: (function () {
        return function () {
            if (this.isPaused) {
                return;
            }
            var controller =
                this.el.components["tracked-controls"] &&
                this.el.components["tracked-controls"].controller;

            var trackedControlsWebXR =
                this.el.components["tracked-controls-webxr"];
            if (!trackedControlsWebXR) {
                return;
            }

            var referenceSpace = trackedControlsWebXR.system.referenceSpace;
            var frame = this.el.sceneEl.frame;

            if (!controller || !frame || !referenceSpace) {
                return;
            }

            if (!this.HandData) {
                this.HandData = new HandData();
                this.el.emit("hand-tracking-extras-ready", {
                    data: this.HandData
                });
            }

            this.HandData.updateData(controller, frame, referenceSpace);

            const GRIP_LONG_START_DISTANCE = 0.15;
            const GRIP_SHORT_START_DISTANCE = 0.125;
            const GRIP_END_DISTANCE = 0.12;
            const PINCH_START = 0.015;
            const PINCH_END = 0.015;

            let jointAPI = this.HandData.jointAPI;
            let wristPos = jointAPI.getWrist().getWristPosition();
            let thumbTipPos = jointAPI.getThumbTip().getPosition();
            let indexTipPos = jointAPI.getIndexTip().getPosition();
            let middleTipPos = jointAPI.getMiddleTip().getPosition();
            let ringTipPos = jointAPI.getRingTip().getPosition();
            let littleTipPos = jointAPI.getLittleTip().getPosition();
            if (
                !checkPos(wristPos) &&
                !checkPos(indexTipPos) &&
                !checkPos(middleTipPos) &&
                !checkPos(ringTipPos) &&
                !checkPos(littleTipPos)
            ) {
                const d1 = indexTipPos.distanceTo(wristPos);
                const d2 = middleTipPos.distanceTo(wristPos);
                const d3 = ringTipPos.distanceTo(wristPos);
                const d4 = ringTipPos.distanceTo(wristPos);
                // console.log("d1 = " + d1);
                // console.log("d2 = " + d2);
                // console.log("d3 = " + d3);
                // console.log("d4 = " + d4);
                if (
                    d1 < GRIP_LONG_START_DISTANCE &&
                    d2 < GRIP_LONG_START_DISTANCE &&
                    d3 < GRIP_SHORT_START_DISTANCE &&
                    d4 < GRIP_SHORT_START_DISTANCE &&
                    this.el.isGrip === false
                ) {
                    this.el.isGrip = true;
                    this.el.emit("gripstarted", {data: {d1, d2, d3, d4}});
                }

                if (
                    d1 > GRIP_END_DISTANCE &&
                    d2 > GRIP_END_DISTANCE &&
                    d3 > GRIP_END_DISTANCE &&
                    d4 > GRIP_END_DISTANCE &&
                    this.el.isGrip === true
                ) {
                    this.el.isGrip = false;
                    this.el.emit("gripended", {data: {d1, d2, d3, d4}});
                }
            }

            if (!checkPos(thumbTipPos) && !checkPos(indexTipPos)) {
                let distance = thumbTipPos.distanceTo(indexTipPos);
                if (distance < PINCH_START && this.el.isPinch === false) {
                    this.el.isPinch = true;
                    this.el.pinchStartPos.copy(thumbTipPos);
                    this.el.emit("mypinchstarted", {data: {dis: distance}});
                }
                if (distance > PINCH_END && this.el.isPinch === true) {
                    this.el.isPinch = false;
                    this.el.emit("mypinchended", {data: {dis: distance}});
                }
                if (this.el.isPinch) {
                    let offsetPos = thumbTipPos.sub(this.el.pinchStartPos);
                    this.el.emit("mypinchmoved", {
                        data: {x: offsetPos.x, y: offsetPos.z}
                    });
                }
            }
        };
    })(),
    play: function () {
        this.isPaused = false;
    },
    pause: function () {
        this.isPaused = true;
    },
    remove: function () {
        this.el.removeEventListener("enter-vr", this.play);
        this.el.removeEventListener("exit-vr", this.pause);
    },
    getRawJoints() {
        if (this.HandData) {
            return this.HandData.joints;
        }
        return null;
    },
    getJoints() {
        if (this.HandData) {
            return this.HandData.jointAPI;
        }
        return null;
    }
});

