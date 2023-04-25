export function getWebRTCServer(proto) {
    //return proto + "//" + location.hostname;
    //return proto + '//turn.dusseldorf-main.tdg.mobiledgex.net';
    //return proto + '//webrtc-pcehljv7ea-uw.a.run.app';
    return proto + "//webxr.mynatapp.cc";
}

export async function getServerConfig() {
    const protocolEndPoint = getWebRTCServer(location.protocol) + "/config";
    const createResponse = await fetch(protocolEndPoint, { mode: "cors" });
    return await createResponse.json();
}

export function getRTCConfiguration() {
    let config = {};
    config.sdpSemantics = "unified-plan";
    config.iceServers = [
        { urls: "stun:stun.l.google.com:19302" }
        //{ urls: ['turn:turn.dusseldorf-main.tdg.mobiledgex.net:3478?transport=udp'], username: 'test' , credential: 'test' }
    ];
    return config;
}
