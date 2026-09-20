"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setTtsPcmSink = setTtsPcmSink;
exports.emitTtsPcm = emitTtsPcm;
exports.stopTtsPlayback = stopTtsPlayback;
let pcmHandler = null;
let stopHandler = null;
function setTtsPcmSink(handler, onStop) {
    pcmHandler = handler;
    stopHandler = onStop ?? null;
}
function emitTtsPcm(pcm, sampleRate) {
    if (pcm.length < 2) {
        return;
    }
    pcmHandler?.(pcm, sampleRate);
}
function stopTtsPlayback() {
    stopHandler?.();
}
