import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.4.6/dist/ethers.esm.min.js";
import * as Logger from "./core/logger.js";
import { InputEvent } from "./core/register-events.js";

const CryptoEvent = {
    Account: 0,
    Sign: 1,
    SendTx: 2,
    SetContract: 3,
    RunContract: 4
};

export class DataChannel {
    constructor(dataChannel) {
        const _this = this;
        this.channel = dataChannel;
        this.provider = null;
        this.signer = null;
        this.contracts = {};

        this.setup();
    }

    async setup() {
        const _this = this;
        if (window.ethereum) {
            //detect ethereum on mobile
            this.handleEthereum();
        } else {
            window.addEventListener(
                "ethereum#initialized",
                this.handleEthereum,
                {
                    once: true
                }
            );

            // If the event is not dispatched by the end of the timeout,
            // the user probably doesn't have MetaMask installed.
            setTimeout(this.handleEthereum, 3000); // 3 seconds
        }

        this.channel.onopen = function () {
            Logger.log("Datachannel connected.");
        };
        this.channel.onerror = function (e) {
            Logger.log(
                "The error " +
                    e.error.message +
                    " occurred\n while handling data with proxy server."
            );
        };
        this.channel.onclose = function () {
            Logger.log("Datachannel disconnected.");
        };

        this.channel.onmessage = async (msg) => {
            // receive message from unity and operate message
            let data;
            // receive message data type is blob only on Firefox
            if (navigator.userAgent.indexOf("Firefox") != -1) {
                data = await msg.data.arrayBuffer();
            } else {
                data = msg.data;
            }

            if (window.ethereum != null) {
                _this.handleCryptoMessage(JSON.parse(data));
            }
        };
    }

    async handleCryptoMessage(data) {
        let header = new DataView(new ArrayBuffer(2));
        header.setUint8(0, InputEvent.Crypto); //for Sending Response
        let enc = new TextEncoder(); // always utf-8
        switch (data["event"]) {
            case "account":
                header.setUint8(1, CryptoEvent.Account); //for response
                this.sendMsg(
                    this.concatArrayBuffers(
                        header.buffer,
                        enc.encode(window.ethereum.selectedAddress)
                    )
                );
                break;
            case "sign":
                let signature = await this.signer.signMessage(data["payload"]);
                header.setUint8(1, CryptoEvent.Sign); //for response
                this.sendMsg(
                    this.concatArrayBuffers(
                        header.buffer,
                        enc.encode(signature)
                    )
                );
                break;
            case "sendTx":
                let payload = JSON.parse(data["payload"]);
                let tx = await this.signer.sendTransaction(payload); //TODO : consider putting entries ourselves
                header.setUint8(1, CryptoEvent.SendTx); //for response
                this.sendMsg(
                    this.concatArrayBuffers(header.buffer, enc.encode(tx.hash))
                );
                break;
            case "setContract":
                let setParams = JSON.parse(data["payload"]);
                let contractAddress = setParams["addr"];
                this.contracts[contractAddress] = new ethers.Contract(
                    contractAddress,
                    setParams["abi"],
                    this.signer
                );
                header.setUint8(1, CryptoEvent.SetContract); //for response
                this.sendMsg(header.buffer); // send ack
                break;
            case "runContract":
                let runParams = JSON.parse(data["payload"]);
                header.setUint8(1, CryptoEvent.RunContract); //for response
                try {
                    let txFn = await this.contracts[runParams["addr"]][
                        runParams["fn"]
                    ](...runParams["args"]);

                    this.sendMsg(
                        this.concatArrayBuffers(
                            header.buffer,
                            enc.encode(JSON.stringify(txFn))
                        )
                    );
                } catch (e) {
                    this.sendMsg(
                        this.concatArrayBuffers(header.buffer, enc.encode(e))
                    );
                }

                //await txFn.wait(); //TODO: is this only for write transactions?

                break;
            default:
                console.log("Event : " + data["event"]);
                console.log("Payload : " + data["payload"]);
                break;
        }
    }

    sendMsg(msg) {
        if (this.channel == null) {
            return;
        }

        switch (this.channel.readyState) {
            case "connecting":
                Logger.log("Connection not ready");
                break;
            case "open":
                this.channel.send(msg);
                break;
            case "closing":
                Logger.log("Attempt to sendMsg message while closing");
                break;
            case "closed":
                Logger.log(
                    "Attempt to sendMsg message while connection closed."
                );
                break;
        }
    }

    concatArrayBuffers(buffer1, buffer2) {
        if (!buffer1) {
            return buffer2;
        } else if (!buffer2) {
            return buffer1;
        }

        var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
        tmp.set(new Uint8Array(buffer1), 0);
        tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
        return tmp.buffer;
    }

    async handleEthereum() {
        if (window.ethereum) {
            console.log("Ethereum successfully detected!");
            // Access the decentralized web!
            await window.ethereum.request({ method: "eth_requestAccounts" });
            this.provider = new ethers.providers.Web3Provider(window.ethereum); // A Web3Provider wraps a standard Web3 provider
            this.signer = this.provider.getSigner(); // The Metamask plugin also allows signing transactions
        } else {
            console.log("Please install MetaMask!");
        }
    }
}

